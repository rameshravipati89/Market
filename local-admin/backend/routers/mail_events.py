"""
Mail Events router — /api/stats, /api/mail-events, /api/credentials
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import pymongo
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from database import get_db
from routers.auth import get_current_user
from services import draft_reply_service

log = logging.getLogger(__name__)

router = APIRouter()


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
        elif isinstance(v, ObjectId):
            doc[k] = str(v)
    return doc


@router.get("/api/stats")
async def get_stats(db=Depends(get_db), _=Depends(get_current_user)):
    today = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    total, today_count, processed, pending, acct_count = await asyncio.gather(
        db.mail_events.count_documents({}),
        db.mail_events.count_documents({"received_at": {"$gte": today}}),
        db.mail_events.count_documents({"status": "processed"}),
        db.mail_events.count_documents({"status": {"$exists": False}}),
        db.credentials.count_documents({"type": "imap", "active": True}),
    )
    return {
        "total_emails":     total,
        "today_emails":     today_count,
        "processed_emails": processed,
        "pending_emails":   pending,
        "active_accounts":  acct_count,
    }


@router.get("/api/mail-events")
async def list_mail_events(
    page:      int            = Query(1, ge=1),
    limit:     int            = Query(20, ge=1, le=100),
    search:    Optional[str]  = Query(None),
    status:    Optional[str]  = Query(None),   # processed | error | pending
    job_title: Optional[str]  = Query(None),
    skill:     Optional[str]  = Query(None),
    db=Depends(get_db),
    _=Depends(get_current_user),
):
    skip = (page - 1) * limit
    query: dict = {}

    if search and search.strip():
        s = search.strip()
        query["$or"] = [
            {"subject":          {"$regex": s, "$options": "i"}},
            {"from_email":       {"$regex": s, "$options": "i"}},
            {"point_of_contact": {"$regex": s, "$options": "i"}},
            {"client_name":      {"$regex": s, "$options": "i"}},
            {"job_contact_mail": {"$regex": s, "$options": "i"}},
            {"job_title":        {"$regex": s, "$options": "i"}},
            {"skills":           {"$regex": s, "$options": "i"}},
        ]

    if status == "pending":
        query["status"] = {"$exists": False}
    elif status == "error":
        query["status"] = "error"
    elif status == "processed":
        query["status"] = "processed"

    if job_title:
        query["job_title"] = {"$regex": job_title, "$options": "i"}
    if skill:
        query["skills"] = {"$regex": skill, "$options": "i"}

    total  = await db.mail_events.count_documents(query)
    cursor = (
        db.mail_events.find(query, {"description": 0})
        .sort("received_at", pymongo.DESCENDING)
        .skip(skip)
        .limit(limit)
    )
    docs = [_serialize(d) async for d in cursor]
    return {
        "data":  docs,
        "total": total,
        "page":  page,
        "limit": limit,
        "pages": -(-total // limit),
    }


@router.get("/api/mail-events/{event_id}")
async def get_mail_event(event_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(400, "Invalid id")
    doc = await db.mail_events.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Not found")
    return _serialize(doc)


@router.post("/api/mail-events/{event_id}/draft-reply")
async def draft_reply(event_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(400, "Invalid id")
    doc = await db.mail_events.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Not found")
    mail = _serialize(doc)
    try:
        result = await draft_reply_service.generate(mail)
        return result
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        log.error("[DraftReply] %s", exc)
        raise HTTPException(500, f"AI generation failed: {exc}")


