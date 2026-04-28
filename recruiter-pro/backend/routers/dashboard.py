"""
/api/dashboard — Aggregated stats for the RecruitIQ Pro overview page.
"""

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

import database

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def dashboard_stats(db=Depends(database.get_db)):
    now   = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week  = now - timedelta(days=7)

    total_mails      = await db.mail_events.count_documents({})
    total_candidates = await db.candidates.count_documents({})
    mails_today      = await db.mail_events.count_documents({"received_at": {"$gte": today}})
    mails_week       = await db.mail_events.count_documents({"received_at": {"$gte": week}})

    # Pipeline stage counts
    pipeline_entries = await db.pipeline.find({}, {"stage": 1, "_id": 0}).to_list(None)
    stage_counts: dict[str, int] = {}
    for e in pipeline_entries:
        s = e.get("stage", "Unknown")
        stage_counts[s] = stage_counts.get(s, 0) + 1

    # Recent mails (last 10)
    recent_mails = await db.mail_events.find(
        {},
        {"_id": 1, "subject": 1, "from_email": 1, "point_of_contact": 1, "received_at": 1}
    ).sort("received_at", -1).limit(10).to_list(None)

    for m in recent_mails:
        m["id"] = str(m.pop("_id"))
        if isinstance(m.get("received_at"), datetime):
            m["received_at"] = m["received_at"].isoformat()

    # Top matches — one row per candidate (their best score across all mails),
    # excluding entries with no candidate name. Top 10 unique.
    top_matches_raw = await db.job_matches.aggregate([
        {"$match": {
            "score": {"$gte": 50},
            "name":  {"$nin": [None, ""]},
        }},
        {"$sort":  {"score": -1}},
        {"$group": {
            "_id":          "$candidate_id",
            "name":         {"$first": "$name"},
            "email":        {"$first": "$email"},
            "score":        {"$first": "$score"},
            "profile":      {"$first": "$profile"},
            "skill_gaps":   {"$first": "$skill_gaps"},
            "visa_status":  {"$first": "$visa_status"},
            "availability": {"$first": "$availability"},
            "mail_id":      {"$first": "$mail_id"},
        }},
        {"$sort":  {"score": -1}},
        {"$limit": 10},
    ]).to_list(None)
    top_matches = [{k: v for k, v in m.items() if k != "_id"} for m in top_matches_raw]

    # Profile mail counts
    profiles = await db.profiles.find({}, {"_id": 0, "name": 1, "color": 1}).to_list(None)

    # Mail volume per day (last 14 days)
    daily = []
    for i in range(13, -1, -1):
        day_start = today - timedelta(days=i)
        day_end   = day_start + timedelta(days=1)
        count = await db.mail_events.count_documents(
            {"received_at": {"$gte": day_start, "$lt": day_end}}
        )
        daily.append({
            "date":  day_start.strftime("%b %d"),
            "count": count,
        })

    # Visa distribution of candidates
    visa_pipeline = await db.candidates.aggregate([
        {"$group": {"_id": "$visa_status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(None)
    visa_dist = [{"visa": d["_id"] or "Unknown", "count": d["count"]} for d in visa_pipeline]

    # Profiles enriched with match stats
    profiles_stats = []
    for p in profiles:
        match_count = await db.job_matches.count_documents(
            {"profile": p["name"], "score": {"$gte": 50}}
        )
        profiles_stats.append({**p, "strong_matches": match_count})

    return {
        "total_mails":      total_mails,
        "total_candidates": total_candidates,
        "mails_today":      mails_today,
        "mails_week":       mails_week,
        "stage_counts":     stage_counts,
        "recent_mails":     recent_mails,
        "top_matches":      top_matches,
        "daily_volume":     daily,
        "visa_distribution": visa_dist,
        "profiles":         profiles_stats,
    }


@router.get("/analytics")
async def analytics(db=Depends(database.get_db)):
    """Deeper analytics for the Analytics tab."""
    # Top skills in demand (from job emails)
    # Approximate: aggregate skill_gaps across all matches → skills recruiter should target
    pipeline = await db.job_matches.aggregate([
        {"$unwind": "$skill_gaps"},
        {"$group": {"_id": "$skill_gaps", "demand": {"$sum": 1}}},
        {"$sort": {"demand": -1}},
        {"$limit": 15},
    ]).to_list(None)
    skills_demand = [{"skill": d["_id"], "demand": d["demand"]} for d in pipeline]

    # Score distribution
    score_buckets = [
        {"range": "90-100", "count": await db.job_matches.count_documents({"score": {"$gte": 90}})},
        {"range": "75-89",  "count": await db.job_matches.count_documents({"score": {"$gte": 75, "$lt": 90}})},
        {"range": "50-74",  "count": await db.job_matches.count_documents({"score": {"$gte": 50, "$lt": 75}})},
        {"range": "25-49",  "count": await db.job_matches.count_documents({"score": {"$gte": 25, "$lt": 50}})},
        {"range": "0-24",   "count": await db.job_matches.count_documents({"score": {"$lt": 25}})},
    ]

    # Matches per profile
    profiles = await db.profiles.find({}, {"_id": 0, "name": 1, "color": 1}).to_list(None)
    profile_matches = []
    for p in profiles:
        cnt = await db.job_matches.count_documents({"profile": p["name"]})
        profile_matches.append({"profile": p["name"], "color": p.get("color"), "matches": cnt})

    return {
        "skills_demand":    skills_demand,
        "score_buckets":    score_buckets,
        "profile_matches":  profile_matches,
    }
