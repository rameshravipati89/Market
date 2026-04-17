"""
STEP 2 — HTML Cleaner (Trafilatura + BeautifulSoup fallback)
Detects whether input is HTML or plain text automatically.
Handles the `description` field from mail_events which contains either.
"""

import logging
import re

import trafilatura
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

_STRIP_PATTERNS = [
    re.compile(r"data:image/[^;]+;base64,[A-Za-z0-9+/=]+", re.IGNORECASE),
    re.compile(r"https?://\S+"),
    re.compile(r"\s{3,}", re.MULTILINE),
]

# Simple heuristic: if text starts with < or contains common HTML tags it's HTML
_HTML_TAGS = re.compile(r"<(html|head|body|div|p|span|table|td|tr|a|br|ul|li|style|script)\b",
                        re.IGNORECASE)


def is_html(text: str) -> bool:
    """Detect whether a string is HTML or plain text."""
    stripped = text.strip()
    return stripped.startswith("<") or bool(_HTML_TAGS.search(stripped[:2000]))


def _trafilatura_clean(html: str) -> str:
    result = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=True,
        deduplicate=True,
        favor_recall=True,
        no_fallback=False,
    )
    return result or ""


def _beautifulsoup_clean(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "nav", "footer",
                     "header", "aside", "form", "button", "iframe",
                     "img", "svg", "meta", "link"]):
        tag.decompose()
    return soup.get_text(separator="\n")


def _post_clean(text: str) -> str:
    for pattern in _STRIP_PATTERNS:
        text = pattern.sub(" ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Remove quoted-printable encoding artifacts like =20, =3D
    text = re.sub(r"=[0-9A-Fa-f]{2}", " ", text)
    # Remove encoded subject prefixes like =?UTF-8?q?...?=
    text = re.sub(r"=\?[^?]+\?[qQbB]\?[^?]+\?=", " ", text)
    return text.strip()


def clean(description: str) -> str:
    """
    Main entry point.
    Accepts the `description` field from mail_events (HTML or plain text).
    Returns clean readable plain text.
    """
    if not description or not description.strip():
        return ""

    if is_html(description):
        log.debug("[HTMLCleaner] Detected HTML body")
        try:
            clean_text = _trafilatura_clean(description)
            if not clean_text or len(clean_text) < 80:
                log.debug("[HTMLCleaner] Trafilatura short — using BS4 fallback")
                clean_text = _beautifulsoup_clean(description)
        except Exception as exc:
            log.warning("[HTMLCleaner] HTML parse error: %s", exc)
            try:
                clean_text = _beautifulsoup_clean(description)
            except Exception:
                clean_text = description  # last resort: return raw
    else:
        log.debug("[HTMLCleaner] Plain text body — skip HTML parsing")
        clean_text = description  # already plain text, just post-clean

    return _post_clean(clean_text)
