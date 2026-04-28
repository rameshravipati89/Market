"""
/api/skill-profiles — Candidate skill profile management.

Each candidate can have multiple named skill profiles, e.g.
  - "Java Developer"  →  primary: [Java, Spring Boot], alt: [Kotlin], other: [SQL, Docker]
  - "Data Engineer"   →  primary: [Python, Spark],     alt: [Scala],  other: [AWS, Airflow]
"""

import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import database
from routers.auth import get_current_user

log = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/skill-profiles",
    tags=["skill-profiles"],
    dependencies=[Depends(get_current_user)],
)


def _oid(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(400, "Invalid id")


def _ser(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


class SkillProfileBody(BaseModel):
    profile_name:      str
    primary_skills:    list[str] = []
    alternative_skills: list[str] = []
    other_skills:      list[str] = []


# ── GET all profiles for a candidate ─────────────────────────────────────────

@router.get("/candidate/{candidate_id}")
async def list_profiles(candidate_id: str, db=Depends(database.get_db)):
    docs = await db.candidate_skill_profiles.find(
        {"candidate_id": candidate_id}
    ).sort("created_at", 1).to_list(None)
    return [_ser(d) for d in docs]


# ── CREATE ────────────────────────────────────────────────────────────────────

@router.post("/candidate/{candidate_id}")
async def create_profile(
    candidate_id: str,
    body: SkillProfileBody,
    db=Depends(database.get_db),
):
    now = datetime.now(timezone.utc)
    doc = {
        "candidate_id":      candidate_id,
        "profile_name":      body.profile_name.strip(),
        "primary_skills":    [s.strip() for s in body.primary_skills    if s.strip()],
        "alternative_skills":[s.strip() for s in body.alternative_skills if s.strip()],
        "other_skills":      [s.strip() for s in body.other_skills      if s.strip()],
        "created_at":        now,
        "updated_at":        now,
    }
    result = await db.candidate_skill_profiles.insert_one(doc)
    return {"id": str(result.inserted_id), **{k: v for k, v in doc.items() if k != "_id"}}


# ── UPDATE ────────────────────────────────────────────────────────────────────

@router.put("/{profile_id}")
async def update_profile(
    profile_id: str,
    body: SkillProfileBody,
    db=Depends(database.get_db),
):
    updates = {
        "profile_name":      body.profile_name.strip(),
        "primary_skills":    [s.strip() for s in body.primary_skills    if s.strip()],
        "alternative_skills":[s.strip() for s in body.alternative_skills if s.strip()],
        "other_skills":      [s.strip() for s in body.other_skills      if s.strip()],
        "updated_at":        datetime.now(timezone.utc),
    }
    result = await db.candidate_skill_profiles.update_one(
        {"_id": _oid(profile_id)}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Profile not found")
    return {"updated": True}


# ── DELETE ────────────────────────────────────────────────────────────────────

@router.delete("/{profile_id}")
async def delete_profile(profile_id: str, db=Depends(database.get_db)):
    result = await db.candidate_skill_profiles.delete_one({"_id": _oid(profile_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Profile not found")
    return {"deleted": True}
