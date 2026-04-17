"""
MongoDB connection and index management for recruiter-pro.
Shared DB with mailclean/mail-injector — reads mail_events and candidates.
"""

import logging
import pymongo
import motor.motor_asyncio

log = logging.getLogger(__name__)

_db = None


async def connect(uri: str, db_name: str) -> None:
    global _db
    client = motor.motor_asyncio.AsyncIOMotorClient(uri, serverSelectionTimeoutMS=10_000)
    _db = client[db_name]
    await _create_indexes()
    log.info("[DB] Connected → %s", db_name)


def get_db():
    return _db


async def _create_indexes() -> None:
    # profiles collection
    await _db.profiles.create_index(
        [("name", pymongo.ASCENDING)],
        name="idx_profile_name", unique=True
    )

    # job_matches collection — pre-computed candidate×mail scores
    await _db.job_matches.create_index(
        [("mail_id", pymongo.ASCENDING), ("profile", pymongo.ASCENDING)],
        name="idx_jm_mail_profile"
    )
    await _db.job_matches.create_index(
        [("candidate_id", pymongo.ASCENDING)],
        name="idx_jm_candidate"
    )
    await _db.job_matches.create_index(
        [("score", pymongo.DESCENDING)],
        name="idx_jm_score"
    )
    await _db.job_matches.create_index(
        [("profile", pymongo.ASCENDING), ("score", pymongo.DESCENDING)],
        name="idx_jm_profile_score"
    )

    # pipeline collection — candidate stage tracking
    await _db.pipeline.create_index(
        [("candidate_id", pymongo.ASCENDING)],
        name="idx_pipeline_candidate", unique=True
    )
    await _db.pipeline.create_index(
        [("stage", pymongo.ASCENDING)],
        name="idx_pipeline_stage"
    )

    # mail_events indexes (shared, ensure for reads)
    await _db.mail_events.create_index(
        [("received_at", pymongo.DESCENDING)],
        name="idx_me_received_at", background=True
    )
    await _db.mail_events.create_index(
        [("status", pymongo.ASCENDING)],
        name="idx_me_status", background=True
    )

    log.info("[DB] Indexes ensured.")
