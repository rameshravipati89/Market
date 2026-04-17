"""
STEP 7 — Batch Processor (asyncio.gather)

Single collection: mail_events
- Junk / internal / too-short / non-English  →  DELETED from mail_events
- Valid emails  →  enriched in-place:
    clean_text, job_title, seniority, work_type, job_type,
    confidence_score, skills, salary, experience, locations,
    visa_info, status='processed'
"""

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import datetime, timezone

import spacy
from dotenv import load_dotenv

from pipeline.detail_extractor import extract as extract_details
from pipeline.html_cleaner import clean as clean_body
from pipeline.job_classifier import JobClassifier
from pipeline.junk_filter import check as check_category
from pipeline.mongo_driver import MongoDriver
from pipeline.skill_extractor import SkillExtractorWrapper

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

MONGO_URI   = os.environ["MONGO_URI"]
MONGO_DB    = os.environ.get("MONGO_DB", "maildb")
BATCH_SIZE  = int(os.environ.get("BATCH_SIZE", 100))
LOOP_SLEEP  = int(os.environ.get("LOOP_SLEEP_SECONDS", 120))
SPACY_MODEL = os.environ.get("SPACY_MODEL", "en_core_web_lg")

_nlp             = None
_classifier      = None
_skill_extractor = None
_executor        = None


def _load_models() -> None:
    global _nlp, _classifier, _skill_extractor, _executor
    log.info("[Startup] Loading spaCy model: %s …", SPACY_MODEL)
    _nlp = spacy.load(SPACY_MODEL)
    log.info("[Startup] spaCy model loaded.")
    _classifier      = JobClassifier(_nlp)
    log.info("[Startup] Initialising SkillExtractor…")
    _skill_extractor = SkillExtractorWrapper(_nlp)
    _executor        = ThreadPoolExecutor(max_workers=4, thread_name_prefix="nlp")
    log.info("[Startup] All models ready.")


# ── Per-email processor ────────────────────────────────────────────────────────

async def process_email(doc: dict, db: MongoDriver,
                        loop: asyncio.AbstractEventLoop,
                        counter: list[int]) -> None:
    doc_id  = doc["_id"]
    subject = doc.get("subject", "")

    # Decode RFC 2047 encoded subjects  e.g. =?UTF-8?q?...?=
    if "=?" in subject:
        try:
            import email.header
            decoded = email.header.decode_header(subject)
            subject = " ".join(
                part.decode(enc or "utf-8") if isinstance(part, bytes) else part
                for part, enc in decoded
            )
        except Exception:
            pass
    subject = subject[:120]

    try:
        # ── STEP 2: Clean HTML → plain text ───────────────────────────────────
        clean_text = clean_body(doc.get("description", ""))

        # ── STEP 3: Filter — delete insufficient mails ─────────────────────────
        category, reason = check_category(subject, clean_text)

        if category in ("junk", "internal"):
            await db.delete_doc(doc_id)
            log.info("[Pipeline] DELETED  [%s]  %s", category.upper(), subject)
            _tick(counter)
            return

        # ── STEP 4: Job classifier ─────────────────────────────────────────────
        classification = await loop.run_in_executor(
            _executor, _classifier.classify, clean_text
        )

        # ── STEPS 5 + 6: Skills + Details (run concurrently) ──────────────────
        skill_future  = loop.run_in_executor(_executor, _skill_extractor.extract, clean_text)
        detail_future = loop.run_in_executor(_executor, extract_details, clean_text)
        skill_result, detail_result = await asyncio.gather(skill_future, detail_future)

        cls = classification  # may be None if confidence < 0.3

        # ── Enrich in-place in mail_events ────────────────────────────────────
        await db.enrich_doc(doc_id, {
            # Cleaned body replaces raw HTML/noisy plain text
            "description":      clean_text,
            # Classification
            "job_title":        cls.job_title        if cls else "",
            "seniority":        cls.seniority        if cls else "unknown",
            "work_type":        cls.work_type        if cls else "unknown",
            "job_type":         cls.job_type         if cls else "unknown",
            "confidence_score": cls.confidence_score if cls else 0.0,
            "matched_terms":    cls.matched_terms    if cls else [],
            # Skills
            "skills":           skill_result.primary_skills + skill_result.secondary_skills,
            "primary_skills":   skill_result.primary_skills,
            "secondary_skills": skill_result.secondary_skills,
            "skill_count":      skill_result.skill_count,
            # Details
            "salary":           asdict(detail_result).get("salary", {}),
            "experience":       asdict(detail_result).get("experience", {}),
            "locations":        detail_result.locations,
            "visa_info":        asdict(detail_result).get("visa_info", {}),
        })

        log.info("[Pipeline] KEPT     %s | %s | score=%.2f skills=%d",
                 subject,
                 cls.job_title if cls else "—",
                 cls.confidence_score if cls else 0.0,
                 skill_result.skill_count)

    except Exception as exc:
        log.error("[Pipeline] ERROR    %s | %s", subject, exc, exc_info=True)
        # Don't delete on error — leave it for retry
        await db._db.mail_events.update_one(
            {"_id": doc_id},
            {"$set": {"status": "error", "error": str(exc)[:200]}}
        )

    finally:
        _tick(counter)


def _tick(counter: list[int]) -> None:
    counter[0] += 1
    if counter[0] % 10 == 0:
        log.info("[Pipeline] Progress: %d done in this batch", counter[0])


# ── Batch runner ───────────────────────────────────────────────────────────────

async def run_batch(db: MongoDriver, loop: asyncio.AbstractEventLoop) -> int:
    total = 0
    async for batch in db.iter_pending():
        log.info("[BatchProcessor] === %d emails ===", len(batch))
        counter = [0]
        await asyncio.gather(
            *[process_email(doc, db, loop, counter) for doc in batch]
        )
        total += len(batch)
        log.info("[BatchProcessor] Done — %d processed", counter[0])
    return total


# ── Entry point ────────────────────────────────────────────────────────────────

async def main() -> None:
    log.info("=" * 60)
    log.info("  mailclean  |  collection: mail_events  |  batch=%d", BATCH_SIZE)
    log.info("  Insufficient/junk/internal → DELETED")
    log.info("  Valid emails → enriched in-place")
    log.info("=" * 60)

    _load_models()

    db = MongoDriver(MONGO_URI, MONGO_DB, batch_size=BATCH_SIZE)
    await db.connect()

    pending = await db.count_pending()
    log.info("[Main] %d unprocessed docs in mail_events", pending)

    loop = asyncio.get_running_loop()
    try:
        while True:
            start   = datetime.now(timezone.utc)
            total   = await run_batch(db, loop)
            elapsed = (datetime.now(timezone.utc) - start).total_seconds()
            log.info("[Main] Pass done — %d emails in %.1fs — sleeping %ds",
                     total, elapsed, LOOP_SLEEP)
            await asyncio.sleep(LOOP_SLEEP)
    except KeyboardInterrupt:
        log.info("[Main] Shutting down…")
    finally:
        db.close()
        if _executor:
            _executor.shutdown(wait=False)


if __name__ == "__main__":
    asyncio.run(main())
