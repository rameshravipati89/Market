"""
Resume service — orchestrates parsing and MongoDB upsert.
Tries Claude first; falls back to regex if Claude is unavailable.
"""

import logging
import os
from datetime import datetime, timezone

from anthropic import APIError

from services import claude_parser, regex_parser

log = logging.getLogger(__name__)

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")


def parse(resume_text: str) -> tuple[dict, str]:
    """
    Parse resume text.
    Returns (parsed_dict, parser_used) where parser_used is 'claude' or 'regex'.
    """
    try:
        result = claude_parser.parse(resume_text, ANTHROPIC_KEY)
        return result, "claude"
    except (APIError, ValueError) as exc:
        log.warning("[ResumeService] Claude unavailable (%s) — using regex", exc)
    except Exception as exc:
        log.warning("[ResumeService] Claude parse error (%s) — using regex", exc)

    return regex_parser.parse(resume_text), "regex"


async def upsert(db, parsed: dict, raw_text: str, filename: str, parser: str) -> str:
    """
    Upsert candidate into MongoDB.
    Deduplicates by email (preferred) or name.
    Returns the candidate's string _id.
    """
    now = datetime.now(timezone.utc)
    doc = {
        **parsed,
        "raw_text":    raw_text,
        "filename":    filename,
        "parser_used": parser,
        "updated_at":  now,
    }

    if parsed.get("email"):
        key = {"email": parsed["email"]}
    elif parsed.get("name"):
        key = {"name": parsed["name"]}
    else:
        doc["uploaded_at"] = now
        result = await db.candidates.insert_one(doc)
        return str(result.inserted_id)

    result = await db.candidates.update_one(
        key,
        {"$set": doc, "$setOnInsert": {"uploaded_at": now}},
        upsert=True,
    )
    if result.upserted_id:
        return str(result.upserted_id)

    rec = await db.candidates.find_one(key, {"_id": 1})
    return str(rec["_id"])
