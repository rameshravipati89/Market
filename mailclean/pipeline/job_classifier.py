"""
STEP 4 — Job Classifier (spaCy PhraseMatcher)
Uses spaCy en_core_web_lg + PhraseMatcher for fast pattern-based
job title detection. No heavy transformer models needed.
Detects: [seniority] + [tech] + [role]  e.g. "Senior Python Engineer"
"""

import logging
import re
from dataclasses import dataclass, field

import spacy
from spacy.matcher import PhraseMatcher

log = logging.getLogger(__name__)

# ── Vocabulary tables ──────────────────────────────────────────────────────────

SENIORITY_LEVELS = {
    "intern":        "intern",
    "internship":    "intern",
    "junior":        "junior",
    "jr":            "junior",
    "associate":     "junior",
    "entry level":   "junior",
    "entry-level":   "junior",
    "mid":           "mid",
    "mid-level":     "mid",
    "mid level":     "mid",
    "intermediate":  "mid",
    "senior":        "senior",
    "sr":            "senior",
    "staff":         "senior",
    "principal":     "senior",
    "lead":          "lead",
    "tech lead":     "lead",
    "team lead":     "lead",
    "manager":       "lead",
    "engineering manager": "lead",
    "architect":     "lead",
    "director":      "lead",
    "vp":            "lead",
}

TECH_TERMS = [
    "python", "java", "javascript", "typescript", "go", "golang", "rust",
    "c++", "c#", "ruby", "php", "swift", "kotlin", "scala", "r",
    "react", "angular", "vue", "node", "nodejs", "django", "flask",
    "fastapi", "spring", "rails", "laravel", "dotnet", ".net",
    "aws", "azure", "gcp", "cloud", "devops", "devsecops", "sre",
    "kubernetes", "k8s", "docker", "terraform", "ansible",
    "machine learning", "ml", "ai", "deep learning", "nlp",
    "data science", "data engineering", "data", "analytics",
    "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
    "kafka", "spark", "hadoop", "airflow", "dbt",
    "ios", "android", "mobile", "flutter", "react native",
    "frontend", "front-end", "backend", "back-end", "fullstack",
    "full stack", "full-stack",
    "cybersecurity", "security", "infosec", "networking",
    "embedded", "firmware", "hardware",
    "qa", "qe", "test", "automation",
    "blockchain", "solidity", "web3",
]

ROLE_TERMS = [
    "engineer", "engineering",
    "developer", "dev",
    "architect",
    "analyst",
    "scientist",
    "administrator", "admin",
    "consultant",
    "specialist",
    "manager",
    "lead",
    "director",
    "intern",
    "designer",
    "product manager", "pm",
    "project manager",
    "program manager",
    "qa engineer", "qa analyst", "quality engineer",
    "devops engineer", "sre",
    "data engineer", "data scientist", "data analyst",
    "site reliability engineer",
    "solutions architect",
    "cloud architect",
    "software engineer", "software developer",
    "systems engineer", "systems administrator",
    "network engineer",
    "security engineer", "security analyst",
]

WORK_TYPE_PATTERNS: dict[str, list[str]] = {
    "remote":  [r"\bremote\b", r"\bwork from home\b", r"\bwfh\b", r"\b100%\s+remote\b"],
    "hybrid":  [r"\bhybrid\b", r"\bpartially remote\b", r"\bflexible location\b"],
    "onsite":  [r"\bonsite\b", r"\bon-site\b", r"\bon site\b", r"\bin.?office\b",
                r"\bin person\b", r"\bnot remote\b"],
}

JOB_TYPE_PATTERNS: dict[str, list[str]] = {
    "contract":   [r"\bcontract\b", r"\bc2c\b", r"\b1099\b", r"\bfreelance\b",
                   r"\bcontract to hire\b", r"\bc2h\b"],
    "full_time":  [r"\bfull.?time\b", r"\bpermanent\b", r"\bdirect hire\b",
                   r"\bw2\b", r"\bfte\b"],
    "part_time":  [r"\bpart.?time\b", r"\bhourly\b", r"\bflexible hours\b"],
}


# ── Dataclass for results ──────────────────────────────────────────────────────

@dataclass
class JobClassification:
    job_title:        str   = ""
    seniority:        str   = "unknown"
    work_type:        str   = "unknown"
    job_type:         str   = "unknown"
    confidence_score: float = 0.0
    matched_terms:    list  = field(default_factory=list)


# ── Classifier ─────────────────────────────────────────────────────────────────

class JobClassifier:
    """
    Loads spaCy model once at startup.
    classify(text) is a regular (sync) method — call it from
    loop.run_in_executor() in async code to avoid blocking.
    """

    def __init__(self, nlp: spacy.Language):
        self._nlp = nlp
        self._matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
        self._build_matcher()
        log.info("[JobClassifier] PhraseMatcher built with %d patterns",
                 len(TECH_TERMS) + len(ROLE_TERMS))

    def _build_matcher(self) -> None:
        """Add tech and role phrases to the PhraseMatcher."""
        tech_docs = [self._nlp.make_doc(t) for t in TECH_TERMS]
        role_docs = [self._nlp.make_doc(t) for t in ROLE_TERMS]
        self._matcher.add("TECH", tech_docs)
        self._matcher.add("ROLE", role_docs)

    def _detect_seniority(self, text_lower: str) -> str:
        """Scan text for seniority keywords, return first match."""
        for phrase, level in SENIORITY_LEVELS.items():
            if re.search(rf"\b{re.escape(phrase)}\b", text_lower):
                return level
        return "unknown"

    def _detect_work_type(self, text_lower: str) -> str:
        for wtype, patterns in WORK_TYPE_PATTERNS.items():
            for p in patterns:
                if re.search(p, text_lower, re.IGNORECASE):
                    return wtype
        return "unknown"

    def _detect_job_type(self, text_lower: str) -> str:
        for jtype, patterns in JOB_TYPE_PATTERNS.items():
            for p in patterns:
                if re.search(p, text_lower, re.IGNORECASE):
                    return jtype
        return "unknown"

    def _build_title(self, seniority: str, tech_matches: list[str],
                     role_matches: list[str]) -> str:
        """Assemble a canonical job title string."""
        parts = []
        if seniority not in ("unknown",):
            parts.append(seniority.title())
        if tech_matches:
            parts.append(tech_matches[0].title())
        if role_matches:
            parts.append(role_matches[0].title())
        return " ".join(parts) if parts else ""

    def classify(self, text: str) -> JobClassification | None:
        """
        Run PhraseMatcher on first 2000 chars of text.
        Returns JobClassification or None if confidence < 0.3.

        Confidence scoring:
          +0.30 for any ROLE match
          +0.25 for any TECH match
          +0.20 for detected seniority
          +0.15 for known work_type
          +0.10 for known job_type
        Max = 1.00
        """
        # Limit to 2000 chars — enough context, keeps spaCy fast
        snippet = text[:2000]
        text_lower = snippet.lower()

        doc = self._nlp(snippet)
        matches = self._matcher(doc)

        tech_hits: list[str] = []
        role_hits: list[str] = []

        for match_id, start, end in matches:
            label = self._nlp.vocab.strings[match_id]
            span_text = doc[start:end].text.lower()
            if label == "TECH" and span_text not in tech_hits:
                tech_hits.append(span_text)
            elif label == "ROLE" and span_text not in role_hits:
                role_hits.append(span_text)

        # Build confidence score
        score = 0.0
        if role_hits:  score += 0.30
        if tech_hits:  score += 0.25
        seniority  = self._detect_seniority(text_lower)
        work_type  = self._detect_work_type(text_lower)
        job_type   = self._detect_job_type(text_lower)
        if seniority != "unknown":  score += 0.20
        if work_type != "unknown":  score += 0.15
        if job_type  != "unknown":  score += 0.10

        # Clamp to [0, 1]
        score = min(round(score, 2), 1.0)

        log.debug("[JobClassifier] tech=%s role=%s seniority=%s score=%.2f",
                  tech_hits[:3], role_hits[:2], seniority, score)

        if score < 0.3:
            return None  # not a job email

        return JobClassification(
            job_title        = self._build_title(seniority, tech_hits, role_hits),
            seniority        = seniority,
            work_type        = work_type,
            job_type         = job_type,
            confidence_score = score,
            matched_terms    = tech_hits + role_hits,
        )
