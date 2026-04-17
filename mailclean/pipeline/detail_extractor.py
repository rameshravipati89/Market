"""
STEP 6 — Detail Extractor (Pure Regex)
Extracts structured fields from clean text using the re module only.
No model loading, no overhead — absolute fastest extraction method.

Fields extracted:
  salary        → {min, max, currency, rate_type}
  experience    → {min_years, max_years, raw}
  locations     → list of "City, ST" strings (up to 3)
  visa_info     → {types: list, sponsorship: bool}
"""

import logging
import re
from dataclasses import dataclass, field

log = logging.getLogger(__name__)


# ── Dataclass ──────────────────────────────────────────────────────────────────

@dataclass
class DetailResult:
    salary:     dict = field(default_factory=dict)
    experience: dict = field(default_factory=dict)
    locations:  list = field(default_factory=list)
    visa_info:  dict = field(default_factory=dict)


# ── Salary patterns ────────────────────────────────────────────────────────────
# Covers: $130K-$150K | $130,000-$150,000 | $75/hr | 75 per hour | up to $200K

_SALARY_RANGE = re.compile(
    r"\$\s*(\d{1,3}(?:,\d{3})*|\d+)([Kk])?\s*[-–to]+\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)([Kk])?",
    re.IGNORECASE,
)
_SALARY_SINGLE = re.compile(
    r"(?:up to\s+)?\$\s*(\d{1,3}(?:,\d{3})*|\d+)([Kk])?\s*(?:/\s*(?:hr|hour|year|yr|annum|annual))?",
    re.IGNORECASE,
)
_HOURLY_RATE = re.compile(
    r"(\d{2,3}(?:\.\d{1,2})?)\s*(?:per\s+hour|/\s*hour|/\s*hr|\bph\b)",
    re.IGNORECASE,
)


def _normalize_salary(amount_str: str, suffix: str) -> int:
    """Convert '130K' → 130000, '130,000' → 130000."""
    amount = int(amount_str.replace(",", ""))
    if suffix and suffix.lower() == "k":
        amount *= 1000
    return amount


def _extract_salary(text: str) -> dict:
    # Try range first: $130K-$150K or $130,000-$150,000
    m = _SALARY_RANGE.search(text)
    if m:
        lo = _normalize_salary(m.group(1), m.group(2))
        hi = _normalize_salary(m.group(3), m.group(4))
        return {"min": lo, "max": hi, "currency": "USD", "rate_type": "annual"}

    # Try hourly rate: $75/hr or 75 per hour
    m = _HOURLY_RATE.search(text)
    if m:
        rate = float(m.group(1))
        return {"min": rate, "max": rate, "currency": "USD", "rate_type": "hourly"}

    # Try single salary: up to $200K or $150K
    m = _SALARY_SINGLE.search(text)
    if m:
        val = _normalize_salary(m.group(1), m.group(2))
        return {"min": None, "max": val, "currency": "USD", "rate_type": "annual"}

    return {}


# ── Experience patterns ────────────────────────────────────────────────────────
# Covers: 5+ years | 3-7 years | minimum 5 years | at least 3 years

_EXP_RANGE = re.compile(
    r"(\d+)\s*[-–to]+\s*(\d+)\s*(?:\+)?\s*years?(?:\s+of)?\s+(?:experience|exp)",
    re.IGNORECASE,
)
_EXP_MIN = re.compile(
    r"(?:minimum|at least|min\.?|(\d+)\+)\s*(\d+)?\s*years?(?:\s+of)?\s+(?:experience|exp)",
    re.IGNORECASE,
)
_EXP_PLUS = re.compile(
    r"(\d+)\+\s*years?(?:\s+of)?\s+(?:experience|exp)",
    re.IGNORECASE,
)
_EXP_SIMPLE = re.compile(
    r"(\d+)\s*years?(?:\s+of)?\s+(?:experience|exp)",
    re.IGNORECASE,
)


def _extract_experience(text: str) -> dict:
    # Range: 3-7 years
    m = _EXP_RANGE.search(text)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        return {"min_years": lo, "max_years": hi, "raw": m.group(0).strip()}

    # X+ years
    m = _EXP_PLUS.search(text)
    if m:
        val = int(m.group(1))
        return {"min_years": val, "max_years": None, "raw": m.group(0).strip()}

    # Simple: 5 years
    m = _EXP_SIMPLE.search(text)
    if m:
        val = int(m.group(1))
        return {"min_years": val, "max_years": val, "raw": m.group(0).strip()}

    return {}


# ── Location patterns ──────────────────────────────────────────────────────────
# Matches "Austin, TX" or "New York, NY" style patterns

_US_STATES = (
    "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|"
    "MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|"
    "WA|WV|WI|WY|DC"
)
_LOCATION = re.compile(
    rf"([A-Z][a-zA-Z\s]{{2,20}}),\s*({_US_STATES})\b",
)

MAX_LOCATIONS = 3


def _extract_locations(text: str) -> list[str]:
    matches = _LOCATION.findall(text)
    seen: list[str] = []
    for city, state in matches:
        loc = f"{city.strip()}, {state.strip()}"
        if loc not in seen:
            seen.append(loc)
        if len(seen) >= MAX_LOCATIONS:
            break
    return seen


# ── Visa / work authorization patterns ────────────────────────────────────────

_VISA_PATTERNS: dict[str, re.Pattern] = {
    "H1B":              re.compile(r"\bH[-\s]?1B\b", re.IGNORECASE),
    "GC":               re.compile(r"\b(green card|gc)\b", re.IGNORECASE),
    "USC":              re.compile(r"\b(us citizen|usc|u\.s\.c\.)\b", re.IGNORECASE),
    "EAD":              re.compile(r"\bEAD\b", re.IGNORECASE),
    "OPT":              re.compile(r"\bOPT\b", re.IGNORECASE),
    "STEM_OPT":         re.compile(r"\bSTEM[\s-]?OPT\b", re.IGNORECASE),
    "C2C":              re.compile(r"\bC2C\b", re.IGNORECASE),
    "W2":               re.compile(r"\bW[-\s]?2\b", re.IGNORECASE),
    "1099":             re.compile(r"\b1099\b"),
    "TN":               re.compile(r"\bTN\s+visa\b", re.IGNORECASE),
    "L1":               re.compile(r"\bL[-\s]?1\b", re.IGNORECASE),
    "CPT":              re.compile(r"\bCPT\b", re.IGNORECASE),
}
_SPONSORSHIP = re.compile(
    r"visa sponsorship\s+(available|provided|offered|supported|yes)",
    re.IGNORECASE,
)
_NO_SPONSORSHIP = re.compile(
    r"(no|not|cannot|will not|won.t)\s+(?:provide|offer|sponsor|support)?\s*visa\s+sponsorship",
    re.IGNORECASE,
)


def _extract_visa(text: str) -> dict:
    detected_types: list[str] = [
        label for label, pattern in _VISA_PATTERNS.items()
        if pattern.search(text)
    ]
    sponsorship: bool | None = None
    if _SPONSORSHIP.search(text):
        sponsorship = True
    elif _NO_SPONSORSHIP.search(text):
        sponsorship = False

    return {
        "types":       detected_types,
        "sponsorship": sponsorship,
    }


# ── Main entry ─────────────────────────────────────────────────────────────────

def extract(text: str) -> DetailResult:
    """
    Run all four regex extractors on the clean text.
    Returns a DetailResult dataclass. All fields default to empty if not found.
    """
    if not text:
        return DetailResult()

    result = DetailResult(
        salary     = _extract_salary(text),
        experience = _extract_experience(text),
        locations  = _extract_locations(text),
        visa_info  = _extract_visa(text),
    )

    log.debug(
        "[DetailExtractor] salary=%s exp=%s locs=%s visa=%s",
        bool(result.salary), bool(result.experience),
        result.locations, result.visa_info.get("types"),
    )
    return result
