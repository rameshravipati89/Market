"""
Candidates router — /api/resume/*
Handles resume upload, parsing, CRUD, and stats.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import pymongo
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile

from database import get_db
from models import CandidateUpdate

# ── Scoring helpers (inline copy from recruiter-pro matcher) ──────────────────

_TECH_TOKENS = re.compile(
    r"\b("
    r"python|java|javascript|typescript|react|angular|vue|node\.?js|"
    r"sql|nosql|mongodb|postgres|mysql|oracle|redis|elasticsearch|"
    r"aws|azure|gcp|docker|kubernetes|k8s|terraform|ansible|jenkins|"
    r"spark|hadoop|kafka|airflow|dbt|snowflake|databricks|"
    r"workday|sap|salesforce|servicenow|"
    r"machine.?learning|ml|ai|nlp|deep.?learning|"
    r"rest|graphql|microservices|api|devops|ci.?cd|"
    r"linux|bash|shell|git|agile|scrum|"
    r"data.?engineer|data.?scientist|etl|pipeline|"
    r"c\+\+|c#|\.net|go|rust|scala|kotlin|swift|"
    r"selenium|playwright|junit|pytest|"
    r"finance|erp|hrms|payroll|gl|ap|ar|"
    r"power.?bi|tableau|looker|qlik"
    r")\b",
    re.IGNORECASE,
)


def _extract_kw(text: str) -> set:
    if not text:
        return set()
    return {t.lower().replace(" ", "").replace(".", "") for t in _TECH_TOKENS.findall(text)}


def _skill_names(raw) -> list:
    if not raw:
        return []
    if isinstance(raw, str):
        return [s.strip() for s in raw.split(",") if s.strip()]
    out = []
    for s in raw:
        if isinstance(s, str) and s.strip():
            out.append(s)
        elif isinstance(s, dict) and s.get("name"):
            out.append(str(s["name"]))
    return out


def _score(candidate: dict, job_kw: set) -> tuple:
    if not job_kw:
        return 0, []
    cand_kw = _extract_kw(" ".join(_skill_names(candidate.get("skills", []))))
    cand_kw |= _extract_kw(candidate.get("summary", ""))
    matched = job_kw & cand_kw
    gaps    = sorted(job_kw - cand_kw)
    score   = min(100, round(len(matched) / len(job_kw) * 100))
    return score, gaps
from routers.auth import get_current_user
from services import docx_extractor, resume_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resume")


def _normalize_skills(skills) -> list[dict]:
    """Backward-compat: legacy records stored skills as strings."""
    if not skills:
        return []
    out = []
    for s in skills:
        if isinstance(s, str):
            out.append({"name": s, "percent": 100})
        elif isinstance(s, dict) and s.get("name"):
            out.append({
                "name":    s["name"],
                "percent": int(s.get("percent", 100)),
            })
    return out


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    if "skills" in doc:
        doc["skills"] = _normalize_skills(doc["skills"])
        if "overall_match" not in doc:
            vals = [s["percent"] for s in doc["skills"]]
            doc["overall_match"] = round(sum(vals) / len(vals)) if vals else 0
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
    if "skills" in updates:
        vals = [s["percent"] for s in updates["skills"]]
        updates["overall_match"] = round(sum(vals) / len(vals)) if vals else 0
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


# ── Rerun Scores ──────────────────────────────────────────────────────────────

_rerun_status: dict = {"running": False, "mails": 0, "scored": 0, "done": False, "error": None}


async def _do_rerun(db):
    global _rerun_status
    try:
        since = datetime.now(timezone.utc) - timedelta(days=7)
        mails = await db.mail_events.find(
            {"received_at": {"$gte": since}},
            {"_id": 1, "subject": 1, "description": 1}
        ).sort("received_at", -1).to_list(500)

        candidates = await db.candidates.find(
            {}, {"_id": 1, "name": 1, "skills": 1, "summary": 1,
                 "visa_status": 1, "availability": 1}
        ).to_list(None)

        _rerun_status["mails"] = len(mails)
        total_scored = 0

        for mail in mails:
            mail_id  = str(mail["_id"])
            job_text = f"{mail.get('subject', '')} {mail.get('description', '')}"
            job_kw   = _extract_kw(job_text)
            if not job_kw:
                continue

            for cand in candidates:
                score, gaps = _score(cand, job_kw)
                if score == 0:
                    continue
                cand_kw = _extract_kw(" ".join(_skill_names(cand.get("skills", []))))
                doc = {
                    "mail_id":      mail_id,
                    "profile":      "",
                    "candidate_id": str(cand["_id"]),
                    "name":         cand.get("name", "Unknown"),
                    "visa_status":  cand.get("visa_status", ""),
                    "availability": cand.get("availability", ""),
                    "skills":       cand.get("skills", []),
                    "score":        score,
                    "skill_gaps":   gaps,
                    "matched_kw":   sorted(job_kw & cand_kw),
                    "updated_at":   datetime.now(timezone.utc),
                }
                await db.job_matches.update_one(
                    {"mail_id": mail_id, "candidate_id": str(cand["_id"])},
                    {"$set": doc},
                    upsert=True,
                )
                total_scored += 1

        _rerun_status.update({"running": False, "scored": total_scored, "done": True, "error": None})
        log.info("[Rerun] Done — %d mails, %d matches written", len(mails), total_scored)
    except Exception as exc:
        log.error("[Rerun] Failed: %s", exc)
        _rerun_status.update({"running": False, "done": True, "error": str(exc)})


@router.post("/rerun-scores")
async def rerun_scores(background_tasks: BackgroundTasks, db=Depends(get_db), _=Depends(get_current_user)):
    global _rerun_status
    if _rerun_status["running"]:
        return {"status": "already_running", **_rerun_status}
    _rerun_status = {"running": True, "mails": 0, "scored": 0, "done": False, "error": None}
    background_tasks.add_task(_do_rerun, db)
    return {"status": "started"}


@router.get("/rerun-scores/status")
async def rerun_scores_status(_=Depends(get_current_user)):
    return _rerun_status


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def resume_stats(db=Depends(get_db), _=Depends(get_current_user)):
    visa_pipeline = [
        {"$group": {"_id": "$visa_status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    # Skills may be stored as strings (legacy) or {name, percent} (new).
    # $ifNull handles legacy: groups by name if present, else by the string.
    skills_pipeline = [
        {"$unwind": "$skills"},
        {"$group": {
            "_id":   {"$ifNull": ["$skills.name", "$skills"]},
            "count": {"$sum": 1},
        }},
        {"$sort":  {"count": -1}},
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
