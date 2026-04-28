"""
/api/mails — Browse mail_events with profile-aware candidate scoring.
"""

import logging
from datetime import datetime, timezone
from bson import ObjectId

from fastapi import APIRouter, Depends, Query, HTTPException

import database
from routers.auth import get_current_user
from services.matcher import compute_matches_for_mail, get_matches_for_mail

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mails", tags=["mails"])


def _scope(user: dict) -> dict:
    """Return Mongo filter that limits results to the user's mailbox.
    Admin sees everything; recruiter sees only mails fetched for their email."""
    return {} if user["role"] == "admin" else {"fetched_for": user["email"]}


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id", ""))
    if isinstance(doc.get("received_at"), datetime):
        doc["received_at"] = doc["received_at"].isoformat()
    return doc


@router.get("")
async def list_mails(
    profile: str = Query(None, description="Filter/score for this profile"),
    limit:   int = Query(50, le=200),
    skip:    int = Query(0),
    db=Depends(database.get_db),
    user: dict = Depends(get_current_user),
):
    """
    Return mail list sorted newest-first.
    If ?profile= is given, attach top-3 candidate scores for each mail.
    Recruiters see only mails from their own mailbox; admins see everything.
    """
    scope = _scope(user)
    mails = await db.mail_events.find(
        scope,
        {"_id": 1, "subject": 1, "from_email": 1, "point_of_contact": 1,
         "received_at": 1, "status": 1, "fetched_for": 1,
         "job_title": 1, "work_type": 1, "job_type": 1,
         "seniority": 1, "cities": 1, "locations": 1}
    ).sort("received_at", -1).skip(skip).limit(limit).to_list(None)

    result = []
    for m in mails:
        doc = _serialize(m)
        if profile:
            matches = await db.job_matches.find(
                {"mail_id": doc["id"], "profile": profile},
                {"_id": 0, "name": 1, "score": 1, "visa_status": 1}
            ).sort("score", -1).limit(3).to_list(None)
            doc["top_candidates"] = matches
        result.append(doc)

    total = await db.mail_events.count_documents(scope)
    return {"total": total, "mails": result}


@router.get("/{mail_id}")
async def get_mail(
    mail_id: str,
    profile: str = Query(None),
    db=Depends(database.get_db),
    user: dict = Depends(get_current_user),
):
    """
    Full mail detail with ALL candidate scores (or re-compute if none stored).
    """
    try:
        oid = ObjectId(mail_id)
    except Exception:
        raise HTTPException(400, "Invalid mail ID")

    mail = await db.mail_events.find_one({"_id": oid, **_scope(user)})
    if not mail:
        raise HTTPException(404, "Mail not found")

    doc = _serialize(mail)

    # Get or compute matches
    matches = await get_matches_for_mail(db, mail_id)
    if not matches and profile:
        # First time — compute now
        raw = await db.mail_events.find_one({"_id": oid})
        matches = await compute_matches_for_mail(db, raw, profile)

    doc["candidates"] = matches[:20]  # top 20
    return doc


@router.post("/{mail_id}/match")
async def trigger_match(
    mail_id: str,
    profile: str = Query(...),
    db=Depends(database.get_db),
    user: dict = Depends(get_current_user),
):
    """Force re-score this mail for a given profile."""
    try:
        oid = ObjectId(mail_id)
    except Exception:
        raise HTTPException(400, "Invalid mail ID")

    mail = await db.mail_events.find_one({"_id": oid, **_scope(user)})
    if not mail:
        raise HTTPException(404, "Mail not found")

    matches = await compute_matches_for_mail(db, mail, profile)
    return {"mail_id": mail_id, "profile": profile, "matched": len(matches)}


@router.delete("/{mail_id}")
async def delete_mail(
    mail_id: str,
    db=Depends(database.get_db),
    user: dict = Depends(get_current_user),
):
    try:
        oid = ObjectId(mail_id)
    except Exception:
        raise HTTPException(400, "Invalid mail ID")

    result = await db.mail_events.delete_one({"_id": oid, **_scope(user)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Mail not found")
    await db.job_matches.delete_many({"mail_id": mail_id})
    return {"deleted": mail_id}
