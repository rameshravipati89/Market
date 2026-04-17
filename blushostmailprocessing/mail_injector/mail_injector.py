"""
mail_injector.py — IMAP IDLE push-based mail watcher

Architecture:
  1. Startup backfill  — fetch last BACKFILL_DAYS days (catches missed mail)
  2. IMAP IDLE loop    — server pushes EXISTS signal the instant mail arrives
  3. On notification   — exit IDLE → fetch UNSEEN → insert → re-enter IDLE
  4. IDLE refresh      — re-enter IDLE every 25 min (RFC 2177 max ~29 min)
  5. Auto-reconnect    — exponential backoff if connection drops

One thread per IMAP account — all share the same MongoDB connection pool.
Latency: < 2 seconds from mail arrival to MongoDB insertion.
"""

import email
import email.utils
import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone

from imapclient import IMAPClient
from pymongo import MongoClient, errors as mongo_errors

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
log = logging.getLogger(__name__)

MONGO_URI     = os.environ["MONGO_URI"]
MONGO_DB      = os.environ.get("MONGO_DB", "maildb")
BATCH_SIZE    = int(os.environ.get("IMAP_BATCH_SIZE", 200))
BACKFILL_DAYS = int(os.environ.get("BACKFILL_DAYS", 7))
IDLE_TIMEOUT     = 25 * 60   # 25 minutes — refresh before server's 29-min limit
MAX_IDLE_CYCLES  = 12        # force full reconnect after ~5 hours (12 × 25 min)

# ── Shared MongoDB pool ────────────────────────────────────────────────────────
_mongo      = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10_000)
_db         = _mongo[MONGO_DB]
mail_events = _db["mail_events"]
credentials = _db["credentials"]

# Ensure deduplication index exists
try:
    mail_events.create_index("message_id", unique=True, sparse=True, name="idx_message_id")
except Exception:
    pass  # index already exists


# ── Credential loader ─────────────────────────────────────────────────────────

def load_imap_accounts() -> list[dict]:
    accounts = list(
        credentials.find(
            {"type": "imap", "active": True},
            {"_id": 0, "host": 1, "port": 1, "ssl": 1,
             "user": 1, "password": 1, "label": 1}
        )
    )
    if not accounts:
        raise RuntimeError("No active IMAP accounts found in credentials collection.")
    log.info("Loaded %d IMAP account(s):", len(accounts))
    for a in accounts:
        log.info("  → %s (%s)", a.get("label", ""), a["user"])
    return accounts


# ── Quick field extractors (scoring-based, no external deps) ─────────────────

_US_STATES = (
    "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|"
    "MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|"
    "WA|WV|WI|WY|DC"
)
_RE_LOCATION = re.compile(
    rf"([A-Z][a-zA-Z .']{{2,25}}),\s*({_US_STATES})\b"
)
_RE_REMOTE = re.compile(r"\bremote\b",     re.IGNORECASE)
_RE_HYBRID = re.compile(r"\bhybrid\b",     re.IGNORECASE)
_RE_ONSITE = re.compile(r"\bon[-\s]?site\b", re.IGNORECASE)

# Words that strongly indicate a job role segment — each match = +3 pts
_ROLE_WORDS = re.compile(
    r"\b(engineer|engineering|developer|dev|architect|analyst|scientist|"
    r"administrator|admin|consultant|specialist|manager|lead|director|"
    r"designer|technician|programmer|contractor|coordinator|intern|"
    r"qa|tester|sre|devops|dba|cto|cio|vp)\b",
    re.IGNORECASE,
)

# Tech/domain keywords — each match = +2 pts
_TECH_WORDS = re.compile(
    r"\b(network|networking|wireless|wifi|wi-fi|lan|wan|cisco|juniper|"
    r"python|java|javascript|typescript|golang|go|rust|c\+\+|c#|scala|kotlin|"
    r"react|angular|vue|node|django|flask|fastapi|spring|dotnet|\.net|"
    r"aws|azure|gcp|cloud|devops|kubernetes|k8s|docker|terraform|ansible|"
    r"machine learning|ml|ai|deep learning|nlp|data science|data engineering|"
    r"sql|postgresql|mysql|mongodb|oracle|workday|sap|salesforce|"
    r"kafka|spark|hadoop|airflow|dbt|snowflake|databricks|"
    r"ios|android|mobile|flutter|react native|"
    r"cybersecurity|security|infosec|firewall|vpn|sdwan|sd-wan|"
    r"embedded|firmware|hardware|rf|5g|lte|voip|"
    r"frontend|backend|fullstack|full.stack|"
    r"erp|crm|bi|etl|scrum|agile|pmo)\b",
    re.IGNORECASE,
)

# Seniority signals — each match = +2 pts
_SENIORITY_WORDS = re.compile(
    r"\b(senior|sr|junior|jr|lead|staff|principal|associate|entry.level|"
    r"mid.level|experienced)\b",
    re.IGNORECASE,
)

# Noise segments that should NEVER be a job title — score penalty = -10 pts
_NOISE_SEGMENT = re.compile(
    r"^(urgent|immediate|hot|opening|requirement|req|position|role|"
    r"hiring|need|new|job|contract|c2c|w2|1099|fulltime|part.time|"
    r"remote|hybrid|onsite|on.site|local|only|locals|preferred|"
    r"h1b|gc|usc|opt|ead|visa|sponsorship|apply|now|asap|"
    r"interview|submission|update|re|fw|fwd|hello|hi|dear|greetings|"
    r"opportunity|available|opening|we.re|we.are|looking)\s*[:\!\*\#\@\.]*$",
    re.IGNORECASE,
)

_DELIMITERS = re.compile(r"[|/\\]+|(?:\s*[-–—]\s*)")


def _score_segment(seg: str) -> int:
    """
    Score how likely this segment is to be a job title.
    Higher = more likely to be the actual title.
    """
    score = 0
    score += len(_ROLE_WORDS.findall(seg))     * 3
    score += len(_TECH_WORDS.findall(seg))     * 2
    score += len(_SENIORITY_WORDS.findall(seg))* 2

    # Penalise noise
    if _NOISE_SEGMENT.match(seg.strip()):
        score -= 10

    # Penalise locations
    if _RE_LOCATION.search(seg):
        score -= 5

    # Penalise pure work-type / contract-type segments
    if _RE_REMOTE.fullmatch(seg.strip()) or _RE_HYBRID.fullmatch(seg.strip()) or _RE_ONSITE.fullmatch(seg.strip()):
        score -= 10
    if re.fullmatch(r"(contract|fulltime|full.time|part.time|c2c|w2)", seg.strip(), re.IGNORECASE):
        score -= 10

    return score


def _extract_work_type(text: str) -> str:
    """Return 'Remote', 'Hybrid', 'Onsite', or '' from subject/body text."""
    if _RE_HYBRID.search(text): return "Hybrid"
    if _RE_REMOTE.search(text): return "Remote"
    if _RE_ONSITE.search(text): return "Onsite"
    return ""


def _extract_cities(text: str) -> list[str]:
    """Return up to 3 'City, ST' strings found in the text."""
    seen = []
    for city, state in _RE_LOCATION.findall(text):
        loc = f"{city.strip()}, {state.strip()}"
        if loc not in seen:
            seen.append(loc)
        if len(seen) >= 3:
            break
    return seen


def _extract_job_title(subject: str) -> str:
    """
    Scoring-based job title extractor.

    Each segment of the subject (split on // | - etc.) is scored:
      +3 per role word   (engineer, developer, analyst …)
      +2 per tech word   (network, wireless, java, cloud …)
      +2 per seniority   (senior, lead, principal …)
      -10 for pure noise (urgent, requirement, contract …)
      -5  for locations
      -10 for pure work-type (remote, hybrid, onsite)

    The highest-scoring segment with score > 0 wins.

    Example:
      "Urgent requirement // Lead Network Wireless Engineer // New York, NY (Onsite) // Contract"
       → scores: -10, +7, -5, -10  → winner: "Lead Network Wireless Engineer"
    """
    # Strip RE:/FW: prefixes
    subject = re.sub(r"^(re|fw|fwd)\s*:\s*", "", subject, flags=re.IGNORECASE).strip()

    parts = [p.strip() for p in _DELIMITERS.split(subject) if p.strip()]

    best_score, best_part = 0, ""
    for part in parts:
        if len(part) < 3:
            continue
        s = _score_segment(part)
        if s > best_score:
            best_score = s
            best_part  = part

    return best_part[:120] if best_part else ""


# ── Email parser ───────────────────────────────────────────────────────────────

def _get_body(msg: email.message.Message) -> str:
    """Prefer text/html so mailclean has full content; fallback to text/plain."""
    html_body = plain_body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            text = payload.decode("utf-8", errors="replace")
            if ct == "text/html" and not html_body:
                html_body = text
            elif ct == "text/plain" and not plain_body:
                plain_body = text
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            plain_body = payload.decode("utf-8", errors="replace")
    return html_body or plain_body


def _all_recipients(msg: email.message.Message) -> list[str]:
    addrs = []
    for header in ("To", "Cc"):
        raw = msg.get(header, "")
        if raw:
            for _, addr in email.utils.getaddresses([raw]):
                if addr:
                    addrs.append(addr.lower())
    return addrs


def parse_email(uid: int, raw: bytes, fetched_for: str) -> dict:
    msg = email.message_from_bytes(raw)

    from_raw = msg.get("From", "")
    try:
        from_raw_decoded = str(email.header.make_header(email.header.decode_header(from_raw)))
    except Exception:
        from_raw_decoded = from_raw
    sender_name, sender_addr = email.utils.parseaddr(from_raw_decoded)
    from_email       = sender_addr.lower()
    point_of_contact = sender_name.strip() or from_email

    to_raw   = msg.get("To", "")
    to_pairs = email.utils.getaddresses([to_raw])
    client_name = to_pairs[0][0].strip() if to_pairs else ""
    if not client_name and to_pairs:
        client_name = to_pairs[0][1]

    contact_vendor = _all_recipients(msg)

    reply_to_raw = msg.get("Reply-To", "")
    _, reply_to_addr = email.utils.parseaddr(reply_to_raw)
    job_contact_mail = reply_to_addr.lower() if reply_to_addr else from_email

    def _h(key: str) -> str:
        """Get and MIME-decode a header value (handles =?UTF-8?Q?...?= etc.)."""
        val = msg.get(key, "")
        if not val:
            return ""
        try:
            decoded = email.header.decode_header(val)
            return str(email.header.make_header(decoded)).strip()
        except Exception:
            return str(val).strip()

    subject   = _h("Subject")
    body      = _get_body(msg)

    # Combine subject + first 2000 chars of body for field extraction
    scan_text = subject + "\n" + body[:2000]

    work_type = _extract_work_type(scan_text)
    cities    = _extract_cities(scan_text)
    job_title = _extract_job_title(subject)

    return {
        "message_id":       _h("Message-ID"),
        "subject":          subject,
        "description":      body,
        "from_email":       from_email,
        "point_of_contact": point_of_contact,
        "client_name":      client_name,
        "contact_vendor":   contact_vendor,
        "job_contact_mail": job_contact_mail,
        "fetched_for":      fetched_for,
        "received_at":      datetime.now(timezone.utc),
        # ── Quick-extracted fields ──────────────────────
        "job_title":        job_title,   # e.g. "Java Developer"
        "work_type":        work_type,   # Remote | Hybrid | Onsite | ""
        "cities":           cities,      # ["Austin, TX", "Dallas, TX"]
    }


# ── MongoDB insert ─────────────────────────────────────────────────────────────

def insert_docs(docs: list[dict], label: str) -> int:
    """Insert docs, silently skip duplicates by message_id."""
    if not docs:
        return 0
    try:
        result = mail_events.insert_many(docs, ordered=False)
        n = len(result.inserted_ids)
        log.info("[%s] Inserted %d new email(s)", label, n)
        return n
    except mongo_errors.BulkWriteError as bwe:
        ok      = bwe.details.get("nInserted", 0)
        skipped = len(bwe.details.get("writeErrors", []))
        if ok:
            log.info("[%s] Inserted %d new, %d duplicate(s) skipped", label, ok, skipped)
        return ok


# ── IMAP fetch helpers ─────────────────────────────────────────────────────────

def fetch_uids(client: IMAPClient, uids: list, label: str) -> int:
    """Fetch a list of UIDs in batches and insert into MongoDB."""
    if not uids:
        return 0
    total = 0
    for i in range(0, len(uids), BATCH_SIZE):
        batch    = uids[i: i + BATCH_SIZE]
        messages = client.fetch(batch, ["BODY.PEEK[]"])
        docs = [
            parse_email(uid, data[b"BODY[]"], label)
            for uid, data in messages.items()
            if data.get(b"BODY[]")
        ]
        total += insert_docs(docs, label)
    return total


def backfill(client: IMAPClient, user: str) -> int:
    """Fetch all messages from the last BACKFILL_DAYS days (seen or unseen)."""
    since_date = (datetime.now() - timedelta(days=BACKFILL_DAYS)).strftime("%d-%b-%Y")
    uids = client.search(["SINCE", since_date])
    log.info("[%s] Backfill: %d email(s) in last %d day(s)", user, len(uids), BACKFILL_DAYS)
    return fetch_uids(client, uids, user)


def fetch_unseen(client: IMAPClient, user: str) -> int:
    """Fetch all currently UNSEEN messages."""
    uids = client.search(["UNSEEN"])
    if uids:
        log.info("[%s] IDLE triggered: %d UNSEEN message(s)", user, len(uids))
    return fetch_uids(client, uids, user)


# ── Account watcher thread ────────────────────────────────────────────────────

class AccountWatcher(threading.Thread):
    """
    One persistent IMAP connection per account.
    Backs off and reconnects automatically on any failure.
    """

    def __init__(self, acct: dict):
        super().__init__(name=acct["user"], daemon=True)
        self.acct    = acct
        self.user    = acct["user"]
        self.label   = acct.get("label", self.user)

    def run(self):
        backoff = 5
        while True:
            try:
                self._connect_and_watch()
                backoff = 5   # reset on clean exit
            except Exception as exc:
                log.error("[%s] Connection lost — reconnecting in %ds: %s",
                          self.user, backoff, exc)
                time.sleep(backoff)
                backoff = min(backoff * 2, 120)   # cap at 2 minutes

    def _connect_and_watch(self):
        host    = self.acct["host"]
        port    = int(self.acct.get("port", 993))
        use_ssl = self.acct.get("ssl", True)

        log.info("[%s] Connecting to %s:%s…", self.user, host, port)
        with IMAPClient(host, port=port, ssl=use_ssl) as client:
            client.login(self.user, self.acct["password"])
            client.select_folder("INBOX", readonly=False)
            log.info("[%s] Connected. Running %d-day backfill…", self.user, BACKFILL_DAYS)

            # ── 1. Backfill last N days on connect ─────────────────────────────
            backfill(client, self.user)

            # ── 2. IDLE loop ───────────────────────────────────────────────────
            log.info("[%s] Entering IDLE — real-time push active.", self.user)
            client.idle()
            idle_cycles = 0

            while True:
                # Wait up to IDLE_TIMEOUT for a server notification
                responses = client.idle_check(timeout=IDLE_TIMEOUT)
                client.idle_done()
                idle_cycles += 1

                # Force reconnect every MAX_IDLE_CYCLES to prevent silent drops
                if idle_cycles >= MAX_IDLE_CYCLES:
                    log.info("[%s] Scheduled reconnect after %d IDLE cycles.",
                             self.user, idle_cycles)
                    return  # triggers reconnect in run() loop

                # Check if server signalled new mail (EXISTS or RECENT)
                new_mail = any(
                    msg_type in (b"EXISTS", b"RECENT")
                    for _, msg_type in responses
                    if isinstance(msg_type, bytes)
                )

                if new_mail:
                    fetch_unseen(client, self.user)
                elif responses:
                    # Other server notification (FLAGS, expunge, etc.) — ignore
                    log.debug("[%s] IDLE response (no new mail): %s", self.user, responses)
                else:
                    # Timeout — just refresh IDLE (keep-alive)
                    log.debug("[%s] IDLE refresh (timeout)", self.user)

                # Re-enter IDLE for next notification
                client.idle()


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("mail_injector starting (IDLE mode) — loading credentials from MongoDB…")

    # Wait for MongoDB to be ready
    for attempt in range(1, 11):
        try:
            ACCOUNTS = load_imap_accounts()
            break
        except Exception as exc:
            log.warning("Attempt %d/10 — not ready: %s", attempt, exc)
            time.sleep(5)
    else:
        log.error("Could not load credentials after 10 attempts. Exiting.")
        raise SystemExit(1)

    log.info("Starting %d watcher thread(s)…", len(ACCOUNTS))
    threads = []
    for acct in ACCOUNTS:
        t = AccountWatcher(acct)
        t.start()
        threads.append(t)

    # Main thread keeps process alive
    for t in threads:
        t.join()
