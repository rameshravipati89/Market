"""
/api/candidates — Read-only view of candidates (written by local-admin resume upload).
"""

import logging
from datetime import datetime
from bson import ObjectId

from fastapi import APIRouter, Depends, Query, HTTPException

import database

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/candidates", tags=["candidates"])


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id", ""))
    for k in ("uploaded_at", "updated_at"):
        if isinstance(doc.get(k), datetime):
            doc[k] = doc[k].isoformat()
    return doc


@router.get("")
async def list_candidates(
    search: str = Query(None),
    visa:   str = Query(None),
    avail:  str = Query(None),
    limit:  int = Query(50, le=200),
    skip:   int = Query(0),
    db=Depends(database.get_db),
):
    filt: dict = {}
    if search:
        filt["$or"] = [
            {"name":       {"$regex": search, "$options": "i"}},
            {"email":      {"$regex": search, "$options": "i"}},
            {"skills":     {"$regex": search, "$options": "i"}},   # legacy string skills
            {"skills.name":{"$regex": search, "$options": "i"}},   # new {name, percent} skills
        ]
    if visa:
        filt["visa_status"] = {"$regex": visa, "$options": "i"}
    if avail:
        filt["availability"] = {"$regex": avail, "$options": "i"}

    docs = await db.candidates.find(filt).sort("uploaded_at", -1).skip(skip).limit(limit).to_list(None)
    total = await db.candidates.count_documents(filt)
    return {"total": total, "candidates": [_serialize(d) for d in docs]}


@router.get("/{cid}")
async def get_candidate(cid: str, db=Depends(database.get_db)):
    try:
        oid = ObjectId(cid)
    except Exception:
        raise HTTPException(400, "Invalid ID")
    doc = await db.candidates.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Candidate not found")
    return _serialize(doc)
