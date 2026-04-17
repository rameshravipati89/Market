"""
Draft reply generator.

Provider priority (first one with a key wins):
  1. Claude  — ANTHROPIC_API_KEY
  2. Groq    — GROQ_API_KEY  (free tier, llama-3 models via OpenAI-compat endpoint)
"""

import os
import logging
import httpx
import anthropic

log = logging.getLogger(__name__)

# ── system prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an experienced staffing / recruiting coordinator at a US IT consulting firm.
Your job is to write warm, professional, and human-sounding email replies to job requirement emails, vendor
submissions, and client follow-ups.

Rules:
- Keep the tone friendly, confident, and concise (3–5 short paragraphs max).
- Do NOT use hollow filler phrases like "I hope this email finds you well" or "Please feel free to reach out".
- Address the sender by first name when available.
- Reference specific details from the original email (role title, client name, skills) so the reply feels personalised.
- End with a clear next-step or call to action.
- Write in plain text — no markdown, no bullet lists, no HTML.
- Sign off as: "Warm regards,\n[Your Name]\nStaffing Coordinator"
"""

USER_PROMPT_TMPL = """Original email details:
Subject: {subject}
From: {from_name} <{from_email}>
Client / Company: {client_name}
Point of Contact: {point_of_contact}
Job Contact: {job_contact_mail}

Body:
{body}

---
Write a professional, humanised reply to this email. Reference the specific role and context above."""


def _build_user_prompt(mail: dict) -> str:
    return USER_PROMPT_TMPL.format(
        subject       = mail.get("subject")         or "(no subject)",
        from_name     = mail.get("point_of_contact") or "",
        from_email    = mail.get("from_email")       or "",
        client_name   = mail.get("client_name")      or "",
        point_of_contact = mail.get("point_of_contact") or "",
        job_contact_mail = mail.get("job_contact_mail")  or "",
        body          = (mail.get("description") or "")[:3000],
    )


# ── providers ─────────────────────────────────────────────────────────────────

async def _via_claude(user_prompt: str) -> str:
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await client.messages.create(
        model      = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001"),
        max_tokens = 600,
        system     = SYSTEM_PROMPT,
        messages   = [{"role": "user", "content": user_prompt}],
    )
    return message.content[0].text.strip()


async def _via_groq(user_prompt: str) -> str:
    """Groq OpenAI-compat endpoint — free tier, ~14k TPM on llama-3."""
    api_key = os.environ["GROQ_API_KEY"]
    payload = {
        "model": os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant"),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        "max_tokens": 600,
        "temperature": 0.7,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()


# ── public entry point ────────────────────────────────────────────────────────

async def generate(mail: dict) -> dict:
    """
    Returns {"reply": str, "provider": str}.
    Raises RuntimeError if no provider is configured.
    """
    user_prompt = _build_user_prompt(mail)

    if os.environ.get("ANTHROPIC_API_KEY", "").strip():
        log.info("[DraftReply] Using Claude")
        reply = await _via_claude(user_prompt)
        return {"reply": reply, "provider": "claude"}

    if os.environ.get("GROQ_API_KEY", "").strip():
        log.info("[DraftReply] Using Groq")
        reply = await _via_groq(user_prompt)
        return {"reply": reply, "provider": "groq"}

    raise RuntimeError(
        "No AI provider configured. Set ANTHROPIC_API_KEY or GROQ_API_KEY in .env"
    )
