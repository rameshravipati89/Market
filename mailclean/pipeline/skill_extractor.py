"""
STEP 5 — Skill Extractor (SkillNer)
Uses SkillNer's pre-built database of 6000+ tech skills.
Extracts full_matches (exact) and ngram_scored (partial > 0.8).
Returns primary_skills, secondary_skills, skill_count.
Text is capped at 3000 chars for speed.
"""

import logging
import sys
from dataclasses import dataclass, field
from types import ModuleType

import spacy
from spacy.matcher import PhraseMatcher

# ── Stub IPython before importing SkillNer ────────────────────────────────────
# SkillNer's visualizer module does `from IPython.core.display import HTML`
# at import time — even though we never use visualisation in a server context.
# Stubbing it avoids pulling in the entire IPython package (~100 MB).
if "IPython" not in sys.modules:
    _ipy = ModuleType("IPython")
    _ipy_core = ModuleType("IPython.core")
    _ipy_display = ModuleType("IPython.core.display")
    _ipy_display.HTML = str          # HTML() only used for notebook rendering
    _ipy_display.display = lambda *a, **kw: None
    _ipy_core.display = _ipy_display
    _ipy.core = _ipy_core
    sys.modules.setdefault("IPython", _ipy)
    sys.modules.setdefault("IPython.core", _ipy_core)
    sys.modules.setdefault("IPython.core.display", _ipy_display)

from skillNer.general_params import SKILL_DB          # noqa: E402
from skillNer.skill_extractor_class import SkillExtractor  # noqa: E402

log = logging.getLogger(__name__)

NGRAM_SCORE_THRESHOLD = 0.8   # minimum score for partial (ngram) matches
MAX_TEXT_CHARS = 3000          # cap input for speed


@dataclass
class SkillResult:
    primary_skills:   list[str] = field(default_factory=list)   # full matches
    secondary_skills: list[str] = field(default_factory=list)   # partial matches
    skill_count:      int       = 0


class SkillExtractorWrapper:
    """
    Wraps SkillNer's SkillExtractor.
    Initialized once at startup — do NOT create per-email.
    extract(text) is synchronous; call via run_in_executor in async code.
    """

    def __init__(self, nlp: spacy.Language):
        log.info("[SkillExtractor] Loading SkillNer database (~6000 skills)…")
        self._extractor = SkillExtractor(nlp, SKILL_DB, PhraseMatcher)
        log.info("[SkillExtractor] Ready.")

    def extract(self, text: str) -> SkillResult:
        """
        Run SkillNer on text (capped at MAX_TEXT_CHARS).
        Returns SkillResult with deduplicated skill lists.
        """
        if not text or not text.strip():
            return SkillResult()

        # Cap length to keep extraction fast
        snippet = text[:MAX_TEXT_CHARS]

        try:
            annotations = self._extractor.annotate(snippet)
        except Exception as exc:
            log.warning("[SkillExtractor] annotate() failed: %s", exc)
            return SkillResult()

        results = annotations.get("results", {})

        # ── Full matches (exact skill names from database) ─────────────────────
        primary: list[str] = []
        for match in results.get("full_matches", []):
            skill_name = match.get("doc_node_value", "").strip().lower()
            if skill_name and skill_name not in primary:
                primary.append(skill_name)

        # ── Ngram scored matches (partial, above threshold) ────────────────────
        secondary: list[str] = []
        for match in results.get("ngram_scored", []):
            score      = match.get("score", 0.0)
            skill_name = match.get("doc_node_value", "").strip().lower()
            if score >= NGRAM_SCORE_THRESHOLD and skill_name:
                # Don't include if already in primary
                if skill_name not in primary and skill_name not in secondary:
                    secondary.append(skill_name)

        log.debug("[SkillExtractor] primary=%d  secondary=%d",
                  len(primary), len(secondary))

        return SkillResult(
            primary_skills   = primary,
            secondary_skills = secondary,
            skill_count      = len(primary) + len(secondary),
        )
