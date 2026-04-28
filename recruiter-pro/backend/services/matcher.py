"""
Candidate ↔ Job-email matcher.

Scores each candidate against a mail's subject + body using keyword overlap.
Stores results in the job_matches collection for fast retrieval.
"""

import re
import logging
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger(__name__)

# Tech skill keywords used for extraction
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


def extract_keywords(text: str) -> set[str]:
    """Extract normalised tech keywords from any text."""
    if not text:
        return set()
    tokens = _TECH_TOKENS.findall(text)
    return {t.lower().replace(" ", "").replace(".", "") for t in tokens}


def _skill_names(raw) -> list[str]:
    """Extract plain skill names from any of: list[str], list[{name, percent}],
    comma-separated string, or empty/None. Tolerates legacy + new shape."""
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


def score_candidate(candidate: dict, job_keywords: set[str]) -> tuple[int, list[str]]:
    """
    Return (score 0-100, skill_gaps).
    Score = matched / required × 100, capped at 100.
    skill_gaps = job_keywords that candidate doesn't have.
    """
    if not job_keywords:
        return 0, []

    candidate_kw = extract_keywords(" ".join(_skill_names(candidate.get("skills", []))))
    candidate_kw |= extract_keywords(candidate.get("summary", ""))

    matched    = job_keywords & candidate_kw
    unmatched  = job_keywords - candidate_kw
    score      = min(100, round(len(matched) / len(job_keywords) * 100))
    skill_gaps = sorted(unmatched)
    return score, skill_gaps


async def compute_matches_for_mail(db, mail: dict, profile: str) -> list[dict]:
    """
    Score all candidates against a single mail and upsert into job_matches.
    Returns sorted list of match docs.
    """
    mail_id = str(mail["_id"])
    job_text = f"{mail.get('subject', '')} {mail.get('description', '')}"
    job_kw   = extract_keywords(job_text)

    if not job_kw:
        return []

    candidates = await db.candidates.find(
        {}, {"_id": 1, "name": 1, "email": 1, "skills": 1, "summary": 1,
             "visa_status": 1, "availability": 1, "rate": 1, "phone": 1}
    ).to_list(None)

    matches = []
    for cand in candidates:
        score, gaps = score_candidate(cand, job_kw)
        if score == 0:
            continue

        doc = {
            "mail_id":      mail_id,
            "profile":      profile,
            "candidate_id": str(cand["_id"]),
            "name":         cand.get("name", "Unknown"),
            "email":        cand.get("email", ""),
            "phone":        cand.get("phone", ""),
            "visa_status":  cand.get("visa_status", ""),
            "availability": cand.get("availability", ""),
            "rate":         cand.get("rate", ""),
            "skills":       cand.get("skills", []),
            "score":        score,
            "skill_gaps":   gaps,
            "matched_kw":   sorted(job_kw & extract_keywords(" ".join(
                                _skill_names(cand.get("skills", []))
                            ))),
            "updated_at":   datetime.now(timezone.utc),
        }

        await db.job_matches.update_one(
            {"mail_id": mail_id, "candidate_id": str(cand["_id"])},
            {"$set": doc},
            upsert=True,
        )
        matches.append(doc)

    matches.sort(key=lambda x: x["score"], reverse=True)
    log.info("[Matcher] Mail %s (%s): scored %d candidates", mail_id, profile, len(matches))
    return matches


async def get_matches_for_mail(db, mail_id: str) -> list[dict]:
    """Return cached matches for a mail, sorted by score desc."""
    return await db.job_matches.find(
        {"mail_id": mail_id},
        {"_id": 0}
    ).sort("score", -1).to_list(None)


async def run_full_profile_match(db, profile_name: str, keywords: list[str]) -> int:
    """
    Match all recent mails for a profile (background seed).
    Returns number of mails processed.
    """
    from datetime import timedelta

    since = datetime.now(timezone.utc) - timedelta(days=30)
    mails = await db.mail_events.find(
        {"received_at": {"$gte": since}},
        {"_id": 1, "subject": 1, "description": 1, "from_email": 1,
         "received_at": 1, "point_of_contact": 1}
    ).sort("received_at", -1).to_list(500)

    count = 0
    for mail in mails:
        await compute_matches_for_mail(db, mail, profile_name)
        count += 1
    return count
