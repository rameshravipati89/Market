"""
MongoDB connection and index management.
Call connect() once at startup; use get_db() anywhere in the app.
"""

import logging

import motor.motor_asyncio
import pymongo

log = logging.getLogger(__name__)

_db = None


async def connect(uri: str, db_name: str) -> None:
    global _db
    client = motor.motor_asyncio.AsyncIOMotorClient(
        uri, serverSelectionTimeoutMS=10_000
    )
    _db = client[db_name]
    await _create_indexes()
    log.info("[DB] Connected → %s", db_name)


def get_db():
    """Return the active database handle (injected via FastAPI Depends)."""
    return _db


async def _create_indexes() -> None:
    # candidates
    await _db.candidates.create_index(
        [("email", pymongo.ASCENDING)],
        name="idx_email", unique=True, sparse=True
    )
    # Text search: covers `skills.name` (new schema) — drop legacy index keyed
    # on `skills` (string) if present so we can recreate with the new spec.
    try:
        await _db.candidates.create_index(
            [("name", pymongo.TEXT), ("skills.name", pymongo.TEXT)],
            name="idx_text_search"
        )
    except pymongo.errors.OperationFailure:
        await _db.candidates.drop_index("idx_text_search")
        await _db.candidates.create_index(
            [("name", pymongo.TEXT), ("skills.name", pymongo.TEXT)],
            name="idx_text_search"
        )
    await _db.candidates.create_index(
        [("visa_status", pymongo.ASCENDING)], name="idx_visa"
    )
    await _db.candidates.create_index(
        [("availability", pymongo.ASCENDING)], name="idx_availability"
    )
    await _db.candidates.create_index(
        [("uploaded_at", pymongo.DESCENDING)], name="idx_uploaded_at"
    )
    # mail_events
    await _db.mail_events.create_index(
        [("status", pymongo.ASCENDING)],
        name="idx_me_status", background=True
    )
    await _db.mail_events.create_index(
        [("received_at", pymongo.DESCENDING)],
        name="idx_me_received_at", background=True
    )
    log.info("[DB] Indexes ensured.")
