"""
fix_headers.py — one-time migration to decode MIME-encoded subjects/names
in existing mail_events documents.

Run:  python fix_headers.py
"""

import email.header
import os
import re

from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://admin:admin123@localhost:27017/maildb?authSource=admin")
MONGO_DB  = os.environ.get("MONGO_DB",  "maildb")

_ENCODED = re.compile(r"=\?[^?]+\?[BbQq]\?[^?]*\?=")

def _decode(val: str) -> str:
    if not val or not _ENCODED.search(val):
        return val
    try:
        return str(email.header.make_header(email.header.decode_header(val))).strip()
    except Exception:
        return val


def main():
    client = MongoClient(MONGO_URI)
    col    = client[MONGO_DB]["mail_events"]

    # Only touch docs that still have encoded chars
    query  = {"$or": [
        {"subject":          {"$regex": r"=\?"}},
        {"point_of_contact": {"$regex": r"=\?"}},
        {"client_name":      {"$regex": r"=\?"}},
    ]}

    total   = col.count_documents(query)
    print(f"Found {total} documents with encoded headers — fixing…")

    fixed = 0
    for doc in col.find(query, {"_id": 1, "subject": 1, "point_of_contact": 1, "client_name": 1}):
        updates = {}
        new_subject = _decode(doc.get("subject", ""))
        new_poc     = _decode(doc.get("point_of_contact", ""))
        new_client  = _decode(doc.get("client_name", ""))

        if new_subject != doc.get("subject"):   updates["subject"]          = new_subject
        if new_poc     != doc.get("point_of_contact"): updates["point_of_contact"] = new_poc
        if new_client  != doc.get("client_name"):      updates["client_name"]      = new_client

        if updates:
            col.update_one({"_id": doc["_id"]}, {"$set": updates})
            fixed += 1

    print(f"Done — fixed {fixed} documents.")
    client.close()


if __name__ == "__main__":
    main()
