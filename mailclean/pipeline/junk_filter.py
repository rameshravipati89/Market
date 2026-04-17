"""
STEP 3 — Junk / Internal Filter (Rule-Based, Zero ML)
Three-way classification: 'job' | 'junk' | 'internal'

INTERNAL signals — group/internal emails to silently ignore:
  Day End Report, Hot List, Bench sales, distribution lists,
  forwarded chains, weekly/daily summaries

JUNK signals — marketing/spam/unsubscribe emails:
  Promotions, offers, newsletters, order confirmations, receipts

JOB signals — actual job postings (keep these):
  Hiring, opportunity, developer, engineer, contract, remote...

Returns: (category: str, reason: str)
  category = 'job' | 'junk' | 'internal'
"""

import logging
import re

from langdetect import detect, LangDetectException

log = logging.getLogger(__name__)

# ── INTERNAL signal patterns ───────────────────────────────────────────────────
# These match group/internal emails that are NOT job postings
INTERNAL_SUBJECT_SIGNALS: list[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in [
    r"\bday\s*end\s*report\b",
    r"\bend\s*of\s*day\b",
    r"\beod\s*report\b",
    r"\bdaily\s*report\b",
    r"\bweekly\s*report\b",
    r"\bmonthly\s*report\b",
    r"\bhot\s*list\b",
    r"\bhotlist\b",
    r"\bbench\s*(sales|report|update|list)\b",
    r"\bupdated\s*(hot\s*)?list\b",
    r"\bcandidate\s*list\b",
    r"\bresource\s*list\b",
    r"\bstatus\s*report\b",
    r"\bteam\s*update\b",
    r"\binternal\s*(update|report|notice|memo)\b",
    r"\bfyi\b",
    r"\bplease\s*(find|see)\s*attached\b",
    r"\bmeeting\s*(notes|minutes|summary|invite)\b",
    r"\bstandup\b",
    r"\bsprint\s*(update|review|retrospective)\b",
    r"\battendance\b",
    r"\bleave\s*(request|approval|update)\b",
    r"\bpayroll\b",
    r"\binvoice\s*#?\d+\b",
    r"\bsow\b",                          # Statement of Work
    r"\bmaster\s*vendor\s*list\b",
    r"\bvendor\s*update\b",
    r"\bclient\s*(update|report|status)\b",
    r"\bmonday\b.*\bupdate\b",
    r"\bfriday\b.*\bupdate\b",
    r"\breport\s*::",                     # e.g. "DAY END REPORT :: 4/3/2025"
]]

INTERNAL_BODY_SIGNALS: list[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in [
    r"\bthis\s+is\s+an\s+internal\s+email\b",
    r"\bfor\s+internal\s+use\s+only\b",
    r"\bdo\s+not\s+forward\b",
    r"\bconfidential\b.*\binternal\b",
    r"\bteam\s+members?\b",
    r"\bdistribution\s+list\b",
    r"\bcc\s*:.*@.*@",                    # multiple CC recipients
]]

# ── JUNK (spam/marketing) signal patterns ─────────────────────────────────────
JUNK_SIGNALS: list[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in [
    r"\bunsubscribe\b",
    r"\bclick\s+here\b",
    r"\bspecial\s+offer\b",
    r"\blimited\s+time\b",
    r"\bdiscount\b",
    r"\bfree\s+gift\b",
    r"\blottery\b",
    r"\bwinner\b",
    r"\bnewsletter\b",
    r"\byour\s+order\b",
    r"\bshipping\s+confirmation\b",
    r"\breceipt\b",
    r"\bpayment\s+(due|received|failed|declined)\b",
    r"\bsubscription\b",
    r"\bsale\s+ends\b",
    r"\bpromo\s+code\b",
    r"\bcoupon\b",
    r"\bact\s+now\b",
    r"\bexclusive\s+deal\b",
    r"\byou\s+have\s+been\s+selected\b",
    r"\bcongratulations\s+you\b",
    r"\bverify\s+your\s+account\b",
    r"\bupdate\s+your\s+(billing|payment|credit\s*card)\b",
    r"\btrack\s+(your\s+)?order\b",
    r"\bdelivery\s+(status|update|confirmation)\b",
    r"\bmarketing\b",
    r"\badvertisement\b",
]]

# ── JOB signal patterns ────────────────────────────────────────────────────────
JOB_SIGNALS: list[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in [
    r"\bjob\s+(opportunity|opening|position|role|description|posting)\b",
    r"\bwe\s+are\s+(hiring|looking\s+for|seeking)\b",
    r"\bimmediately\s+(available|hiring)\b",
    r"\bcontract\s+(role|position|opportunity|to\s+hire)\b",
    r"\bfull.?time\b",
    r"\bpart.?time\b",
    r"\b(remote|hybrid|onsite|on-site)\b",
    r"\b\d+\+?\s+years?\s+(of\s+)?experience\b",
    r"\bskills\s+required\b",
    r"\bjob\s+(title|responsibilities|duties|summary)\b",
    r"\bapply\s+(now|today|here|online)\b",
    r"\bresume\b",
    r"\bcandidate\b",
    r"\binterview\b",
    r"\bsalary\b",
    r"\bcompensation\b",
    r"\bc2c\b|\bw2\b|\b1099\b",
    r"\bvisa\s+(sponsorship|status)\b",
    r"\bwork\s+authorization\b",
    r"\bhiring\s+(now|immediately|urgently|for)\b",
    r"\bnew\s+opportunity\b",
    r"\bplease\s+(share|forward)\s+(your\s+)?(resume|cv|profile)\b",
    r"\b(engineer|developer|analyst|architect|consultant|specialist)\b",
    r"\b(python|java|javascript|react|angular|aws|azure|sql|devops|data)\b",
]]

MIN_TEXT_LENGTH = 80

# Thresholds
INTERNAL_SUBJECT_THRESHOLD = 1   # 1 internal subject hit = internal
JUNK_THRESHOLD             = 3   # 3 junk hits + 0 job hits = junk
NET_JUNK_OVER_JOB          = 2   # junk_score - job_score >= 2 = junk


def _score(text: str, patterns: list[re.Pattern]) -> int:
    return sum(1 for p in patterns if p.search(text))


def check(subject: str, text: str) -> tuple[str, str]:
    """
    Three-way classification.
    Returns (category, reason) where category ∈ {'job', 'junk', 'internal'}.

    Priority order:
    1. Too short          → junk
    2. Non-English        → junk
    3. Internal subject   → internal  (checked on subject line first)
    4. Internal body      → internal
    5. Junk signals dominate → junk
    6. Otherwise          → job (passes to classifier)
    """
    combined = f"{subject}\n{text}"

    # ── 1. Minimum length ──────────────────────────────────────────────────────
    if len(text.strip()) < MIN_TEXT_LENGTH:
        return "junk", f"too_short ({len(text)} chars)"

    # ── 2. English only ────────────────────────────────────────────────────────
    try:
        lang = detect(text[:800])
        if lang != "en":
            return "junk", f"non_english ({lang})"
    except LangDetectException:
        pass

    # ── 3. Internal — subject line signals (highest priority) ─────────────────
    subject_internal_hits = _score(subject, INTERNAL_SUBJECT_SIGNALS)
    if subject_internal_hits >= INTERNAL_SUBJECT_THRESHOLD:
        return "internal", f"internal_subject ({subject_internal_hits} signals: {subject[:60]})"

    # ── 4. Internal — body signals ─────────────────────────────────────────────
    body_internal_hits = _score(text, INTERNAL_BODY_SIGNALS)
    if body_internal_hits >= 2:
        return "internal", f"internal_body ({body_internal_hits} signals)"

    # ── 5. Junk scoring ────────────────────────────────────────────────────────
    junk_score = _score(combined, JUNK_SIGNALS)
    job_score  = _score(combined, JOB_SIGNALS)

    if junk_score >= JUNK_THRESHOLD and job_score == 0:
        return "junk", f"junk_dominant (junk={junk_score}, job=0)"

    if (junk_score - job_score) >= NET_JUNK_OVER_JOB:
        return "junk", f"junk_over_job (junk={junk_score}, job={job_score})"

    # ── 6. Passes — treat as potential job posting ────────────────────────────
    return "job", f"ok (junk={junk_score}, job={job_score})"
