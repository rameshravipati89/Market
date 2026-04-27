"""
Credentials management router
Full CRUD for IMAP mail accounts + connection test.
Passwords are never returned in list/get responses.
"""

import imaplib
import logging
import socket
from datetime import datetime, timezone

import pymongo
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from routers.auth import get_current_user

log = logging.getLogger(__name__)
router = APIRouter()


# ── helpers ────────────────────────────────────────────────────────────────────

def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
        elif isinstance(v, ObjectId):
            doc[k] = str(v)
    doc.pop("password", None)
    return doc


def _oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(400, "Invalid id")


# ── request models ─────────────────────────────────────────────────────────────

class CredentialIn(BaseModel):
    label: str
    host: str
    port: int = 993
    ssl: bool = True
    user: str
    password: str = ""      # empty = keep existing password on update
    active: bool = True


class TestRequest(BaseModel):
    host: str
    port: int = 993
    ssl: bool = True
    user: str
    password: str


# ── test connection (no DB) ────────────────────────────────────────────────────

@router.post("/api/credentials/test")
async def test_connection(body: TestRequest, _=Depends(get_current_user)):
    """Verify IMAP credentials without saving anything."""
    try:
        if body.ssl:
            conn = imaplib.IMAP4_SSL(body.host, body.port, timeout=10)
        else:
            conn = imaplib.IMAP4(body.host, body.port, timeout=10)
        conn.login(body.user, body.password)
        _status, data = conn.select("INBOX", readonly=True)
        count = int(data[0]) if data and data[0] else 0
        conn.logout()
        return {"ok": True, "inbox_count": count}
    except imaplib.IMAP4.error as exc:
        raise HTTPException(400, f"IMAP error: {exc}")
    except (socket.timeout, TimeoutError, OSError) as exc:
        raise HTTPException(400, f"Connection failed: {exc}")
    except Exception as exc:
        raise HTTPException(400, str(exc))


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.get("/api/credentials")
async def list_credentials(db=Depends(get_db), _=Depends(get_current_user)):
    cursor = (
        db.credentials.find({"type": "imap"}, {"password": 0})
        .sort("created_at", pymongo.DESCENDING)
    )
    return [_serialize(d) async for d in cursor]


@router.post("/api/credentials", status_code=201)
async def create_credential(
    body: CredentialIn, db=Depends(get_db), _=Depends(get_current_user)
):
    if not body.password:
        raise HTTPException(400, "Password is required")
    existing = await db.credentials.find_one({"type": "imap", "user": body.user})
    if existing:
        raise HTTPException(409, f"Account already exists: {body.user}")
    now = datetime.now(timezone.utc)
    doc = {
        "type":       "imap",
        "label":      body.label,
        "host":       body.host,
        "port":       body.port,
        "ssl":        body.ssl,
        "user":       body.user,
        "password":   body.password,
        "active":     body.active,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.credentials.insert_one(doc)
    log.info("[Credentials] Created account: %s", body.user)
    return {"id": str(result.inserted_id)}


@router.put("/api/credentials/{cred_id}")
async def update_credential(
    cred_id: str, body: CredentialIn,
    db=Depends(get_db), _=Depends(get_current_user)
):
    oid = _oid(cred_id)
    existing = await db.credentials.find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Account not found")
    updates = {
        "label":      body.label,
        "host":       body.host,
        "port":       body.port,
        "ssl":        body.ssl,
        "user":       body.user,
        "active":     body.active,
        "updated_at": datetime.now(timezone.utc),
    }
    if body.password:
        updates["password"] = body.password
    await db.credentials.update_one({"_id": oid}, {"$set": updates})
    log.info("[Credentials] Updated account: %s", body.user)
    return {"updated": True}


@router.patch("/api/credentials/{cred_id}/toggle")
async def toggle_credential(
    cred_id: str, db=Depends(get_db), _=Depends(get_current_user)
):
    oid = _oid(cred_id)
    existing = await db.credentials.find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Account not found")
    new_active = not existing.get("active", True)
    await db.credentials.update_one(
        {"_id": oid},
        {"$set": {"active": new_active, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"active": new_active}


@router.delete("/api/credentials/{cred_id}")
async def delete_credential(
    cred_id: str, db=Depends(get_db), _=Depends(get_current_user)
):
    oid = _oid(cred_id)
    result = await db.credentials.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Account not found")
    return {"deleted": True}
