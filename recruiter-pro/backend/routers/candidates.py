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


@router.get("/{cid}/matched-mails")
async def candidate_matched_mails(
    cid:       str,
    min_score: int = Query(50, ge=0, le=100),
    limit:     int = Query(50, le=200),
    skip:      int = Query(0),
    db=Depends(database.get_db),
):
    from bson import ObjectId as OID
    filt: dict = {"candidate_id": cid, "score": {"$gte": min_score}}
    total = await db.job_matches.count_documents(filt)
    rows  = await db.job_matches.find(
        filt, {"_id":0,"mail_id":1,"score":1,"skill_gaps":1,"matched_kw":1}
    ).sort("score", -1).skip(skip).limit(limit).to_list(None)
    if not rows:
        return {"total": total, "mails": []}

    oids = []
    for r in rows:
        try: oids.append(OID(r["mail_id"]))
        except Exception: pass
    mail_docs = await db.mail_events.find(
        {"_id": {"$in": oids}},
        {"_id":1,"subject":1,"from_email":1,"received_at":1,"job_title":1,"work_type":1,"locations":1,"cities":1}
    ).to_list(None)
    mmap = {str(m["_id"]): m for m in mail_docs}

    result = []
    for r in rows:
        m = mmap.get(r["mail_id"], {})
        recv = m.get("received_at")
        locs = (m.get("locations") or []) + (m.get("cities") or [])
        result.append({
            "mail_id":    r["mail_id"],
            "score":      r["score"],
            "skill_gaps": r.get("skill_gaps") or [],
            "matched_kw": r.get("matched_kw") or [],
            "subject":    m.get("subject") or "(no subject)",
            "from_email": m.get("from_email") or "",
            "received_at": recv.isoformat() if isinstance(recv, datetime) else (recv or ""),
            "job_title":  m.get("job_title") or "",
            "work_type":  m.get("work_type") or "",
            "location":   locs[0] if locs else "",
        })
    return {"total": total, "mails": result}


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
