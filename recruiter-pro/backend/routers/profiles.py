"""
/api/profiles — CRUD for recruiting profiles (Data Engineer, Java, Workday, etc.)
Each profile defines a set of required/nice-to-have skills that drive mail matching.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import database
from services.matcher import run_full_profile_match

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/profiles", tags=["profiles"])

DEFAULT_PROFILES = [
    {
        "name": "Data Engineer",
        "keywords": ["python", "spark", "kafka", "airflow", "sql", "etl", "databricks",
                     "aws", "azure", "gcp", "snowflake", "dbt", "pipeline", "hadoop"],
        "required_skills": ["python", "sql", "etl"],
        "nice_skills": ["spark", "kafka", "airflow"],
        "color": "#6366f1",
        "icon": "database",
    },
    {
        "name": "Java",
        "keywords": ["java", "spring", "microservices", "rest", "kafka", "kubernetes",
                     "docker", "sql", "hibernate", "maven", "junit"],
        "required_skills": ["java", "spring", "rest"],
        "nice_skills": ["kafka", "kubernetes", "microservices"],
        "color": "#f59e0b",
        "icon": "code",
    },
    {
        "name": "Oracle Finance",
        "keywords": ["oracle", "finance", "erp", "gl", "ap", "ar", "payroll",
                     "sql", "plsql", "fusion", "ebs"],
        "required_skills": ["oracle", "finance", "erp"],
        "nice_skills": ["fusion", "plsql"],
        "color": "#10b981",
        "icon": "chart-bar",
    },
    {
        "name": "Workday",
        "keywords": ["workday", "hrms", "payroll", "hr", "finance", "erp",
                     "integration", "studio", "raas", "ecs"],
        "required_skills": ["workday"],
        "nice_skills": ["integration", "studio", "payroll"],
        "color": "#ec4899",
        "icon": "briefcase",
    },
]


class ProfileIn(BaseModel):
    name: str
    keywords: list[str] = []
    required_skills: list[str] = []
    nice_skills: list[str] = []
    color: str = "#6366f1"
    icon: str = "star"


@router.get("")
async def list_profiles(db=Depends(database.get_db)):
    profiles = await db.profiles.find({}, {"_id": 0}).to_list(None)
    if not profiles:
        # Auto-seed defaults on first call
        now = datetime.now(timezone.utc)
        for p in DEFAULT_PROFILES:
            p["created_at"] = now
            await db.profiles.update_one({"name": p["name"]}, {"$setOnInsert": p}, upsert=True)
        profiles = await db.profiles.find({}, {"_id": 0}).to_list(None)

    # Attach mail counts
    for p in profiles:
        p["mail_count"] = await db.mail_events.count_documents({})
    return profiles


@router.post("", status_code=201)
async def create_profile(body: ProfileIn, db=Depends(database.get_db)):
    existing = await db.profiles.find_one({"name": body.name})
    if existing:
        raise HTTPException(409, f"Profile '{body.name}' already exists")
    doc = body.model_dump()
    doc["created_at"] = datetime.now(timezone.utc)
    await db.profiles.insert_one(doc)
    # Background: run match for last 30 days of mails
    await run_full_profile_match(db, body.name, body.keywords)
    return {"created": body.name}


@router.put("/{name}")
async def update_profile(name: str, body: ProfileIn, db=Depends(database.get_db)):
    doc = body.model_dump()
    doc["updated_at"] = datetime.now(timezone.utc)
    result = await db.profiles.update_one({"name": name}, {"$set": doc})
    if result.matched_count == 0:
        raise HTTPException(404, f"Profile '{name}' not found")
    return {"updated": name}


@router.delete("/{name}")
async def delete_profile(name: str, db=Depends(database.get_db)):
    result = await db.profiles.delete_one({"name": name})
    if result.deleted_count == 0:
        raise HTTPException(404, f"Profile '{name}' not found")
    await db.job_matches.delete_many({"profile": name})
    return {"deleted": name}


@router.post("/{name}/rematch")
async def rematch_profile(name: str, db=Depends(database.get_db)):
    """Re-run matching for all recent mails under this profile."""
    profile = await db.profiles.find_one({"name": name})
    if not profile:
        raise HTTPException(404, f"Profile '{name}' not found")
    count = await run_full_profile_match(db, name, profile.get("keywords", []))
    return {"profile": name, "mails_processed": count}
