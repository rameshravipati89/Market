"""
Candidates router — /api/resume/*
Handles resume upload, parsing, CRUD, and stats.
"""

import logging
from datetime import datetime
from typing import Optional

import pymongo
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from database import get_db
from models import CandidateUpdate
from routers.auth import get_current_user
from services import docx_extractor, resume_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resume")


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
        elif isinstance(v, ObjectId):
            doc[k] = str(v)
    return doc


def _oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(400, "Invalid id")


# ── Upload ─────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_resume(file: UploadFile = File(...), db=Depends(get_db), _=Depends(get_current_user)):
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(400, "Only .docx files are supported")

    data = await file.read()
    try:
        text = docx_extractor.extract(data)
    except Exception as exc:
        raise HTTPException(422, f"Could not read DOCX: {exc}")

    if len(text.strip()) < 50:
        raise HTTPException(422, "Document appears to be empty or unreadable")

    parsed, parser = resume_service.parse(text)
    cid = await resume_service.upsert(db, parsed, text, file.filename, parser)
    log.info("[Candidates] Uploaded: %s  parser=%s  id=%s", file.filename, parser, cid)
    return {"id": cid, "parser_used": parser, "candidate": parsed}


@router.post("/bulk-upload")
async def bulk_upload(files: list[UploadFile] = File(...), db=Depends(get_db), _=Depends(get_current_user)):
    results = []
    for f in files:
        try:
            if not f.filename.lower().endswith(".docx"):
                results.append({"filename": f.filename, "status": "skipped",
                                 "reason": "not .docx"})
                continue
            data   = await f.read()
            text   = docx_extractor.extract(data)
            parsed, parser = resume_service.parse(text)
            cid    = await resume_service.upsert(db, parsed, text, f.filename, parser)
            results.append({"filename": f.filename, "status": "ok",
                             "id": cid, "parser_used": parser})
        except Exception as exc:
            log.error("[Candidates] bulk error %s: %s", f.filename, exc)
            results.append({"filename": f.filename, "status": "error",
                             "reason": str(exc)})
    return {"processed": len(results), "results": results}


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.get("/candidates")
async def list_candidates(
    search:       Optional[str] = Query(None),
    visa:         Optional[str] = Query(None),
    availability: Optional[str] = Query(None),
    page:         int           = Query(1, ge=1),
    limit:        int           = Query(20, ge=1, le=100),
    db=Depends(get_db),
    _=Depends(get_current_user),
):
    query: dict = {}
    if search:
        query["$text"] = {"$search": search}
    if visa:
        query["visa_status"] = visa
    if availability:
        query["availability"] = availability

    skip  = (page - 1) * limit
    total = await db.candidates.count_documents(query)
    cursor = (
        db.candidates.find(query, {"raw_text": 0})
        .sort("uploaded_at", pymongo.DESCENDING)
        .skip(skip)
        .limit(limit)
    )
    docs = [_serialize(d) async for d in cursor]
    return {"total": total, "page": page, "limit": limit, "candidates": docs}


@router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    doc = await db.candidates.find_one({"_id": _oid(candidate_id)})
    if not doc:
        raise HTTPException(404, "Candidate not found")
    return _serialize(doc)


@router.put("/candidates/{candidate_id}")
async def update_candidate(
    candidate_id: str, body: CandidateUpdate, db=Depends(get_db), _=Depends(get_current_user)
):
    from datetime import timezone
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.candidates.update_one(
        {"_id": _oid(candidate_id)}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Candidate not found")
    return {"updated": True}


@router.delete("/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    result = await db.candidates.delete_one({"_id": _oid(candidate_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Candidate not found")
    return {"deleted": True}


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def resume_stats(db=Depends(get_db), _=Depends(get_current_user)):
    visa_pipeline = [
        {"$group": {"_id": "$visa_status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    skills_pipeline = [
        {"$unwind": "$skills"},
        {"$group": {"_id": "$skills", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15},
    ]
    avail_pipeline = [
        {"$group": {"_id": "$availability", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    visa_data = [
        {"visa": d["_id"] or "Unknown", "count": d["count"]}
        async for d in db.candidates.aggregate(visa_pipeline)
    ]
    skills_data = [
        {"skill": d["_id"], "count": d["count"]}
        async for d in db.candidates.aggregate(skills_pipeline)
    ]
    avail_data = [
        {"availability": d["_id"] or "Unknown", "count": d["count"]}
        async for d in db.candidates.aggregate(avail_pipeline)
    ]
    total = await db.candidates.count_documents({})
    return {
        "total_candidates": total,
        "visa_breakdown":   visa_data,
        "top_skills":       skills_data,
        "availability":     avail_data,
    }
