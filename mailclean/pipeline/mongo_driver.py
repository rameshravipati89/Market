"""
STEP 1 — MongoDB Driver (Motor — Async)
Single collection: mail_events
- Insufficient/junk/internal docs → DELETED
- Valid job docs → updated in-place with cleaned text + enrichment
"""

import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

import motor.motor_asyncio
import pymongo
from bson import ObjectId

log = logging.getLogger(__name__)


class MongoDriver:

    def __init__(self, uri: str, db_name: str, batch_size: int = 100):
        self._uri        = uri
        self._db_name    = db_name
        self._batch_size = batch_size
        self._client     = None
        self._db         = None

    async def connect(self) -> None:
        self._client = motor.motor_asyncio.AsyncIOMotorClient(
            self._uri, serverSelectionTimeoutMS=10_000
        )
        self._db = self._client[self._db_name]
        await self._create_indexes()
        log.info("[MongoDB] Connected → %s / %s", self._uri.split("@")[-1], self._db_name)

    async def _create_indexes(self) -> None:
        # Use the same index names as local-admin to avoid IndexOptionsConflict
        await self._db.mail_events.create_index(
            [("status", pymongo.ASCENDING)], name="idx_me_status", background=True
        )
        await self._db.mail_events.create_index(
            [("skills", pymongo.ASCENDING)], name="idx_skills", background=True
        )
        await self._db.mail_events.create_index(
            [("processed_at", pymongo.DESCENDING)], name="idx_processed_at", background=True
        )
        log.info("[MongoDB] Indexes ensured on mail_events.")

    # ── Read unprocessed ───────────────────────────────────────────────────────

    async def iter_pending(self) -> AsyncGenerator[list[dict], None]:
        """Yield batches of docs that have no status yet."""
        skip = 0
        while True:
            batch = await (
                self._db.mail_events
                .find({"status": {"$exists": False}})
                .skip(skip)
                .limit(self._batch_size)
                .to_list(length=self._batch_size)
            )
            if not batch:
                break
            log.info("[MongoDB] Batch: %d unprocessed docs", len(batch))
            yield batch
            if len(batch) < self._batch_size:
                break
            skip += self._batch_size

    async def count_pending(self) -> int:
        return await self._db.mail_events.count_documents({"status": {"$exists": False}})

    # ── Write ──────────────────────────────────────────────────────────────────

    async def enrich_doc(self, doc_id: ObjectId, fields: dict) -> None:
        """Update the doc in-place with cleaned text + classification."""
        fields["status"]       = "processed"
        fields["processed_at"] = datetime.now(timezone.utc)
        await self._db.mail_events.update_one({"_id": doc_id}, {"$set": fields})

    async def delete_doc(self, doc_id: ObjectId) -> None:
        """Permanently remove an insufficient/junk/internal doc."""
        await self._db.mail_events.delete_one({"_id": doc_id})

    def close(self) -> None:
        if self._client:
            self._client.close()
