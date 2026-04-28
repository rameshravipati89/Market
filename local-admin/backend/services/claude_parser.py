"""
Resume parser using Claude AI (Anthropic SDK).
Raises ValueError if API key is not configured.
Raises anthropic.APIError on API failures.
"""

import json
import re

from anthropic import Anthropic

_PROMPT = """You are a resume parser. Extract structured information from the resume text below.

For each skill, assign a `percent` (0-100) reflecting proficiency depth based on
context: years of use, project complexity, role responsibility, recency, and how
prominently it features. Strong primary skills with 5+ yrs = 90-100. Solid
working knowledge / 2-4 yrs = 70-85. Mentioned but limited / <2 yrs = 50-65.
Briefly listed only = 40-50. Use 80 if unclear but plainly listed.

Return ONLY a JSON object with these exact fields (use null if not found):
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "phone number",
  "location": "City, State",
  "current_title": "current job title",
  "total_experience_years": 5,
  "skills": [{"name": "Java", "percent": 95}, {"name": "Python", "percent": 80}],
  "primary_skills": ["top 5 skill names"],
  "visa_status": "H1B|GC|USC|OPT|CPT|TN|Other|Unknown",
  "work_authorization": "description if any",
  "availability": "Immediate|2 weeks|1 month|Unknown",
  "expected_rate": "rate per hour or annual salary",
  "current_employer": "company name",
  "linkedin": "linkedin url if present",
  "summary": "2-3 sentence professional summary",
  "education": [{"degree": "", "institution": "", "year": ""}],
  "certifications": ["cert1"],
  "languages": ["English"]
}

Resume text:
"""


def parse(resume_text: str, api_key: str) -> dict:
    """
    Parse resume text using Claude.
    Returns a dict matching the schema above.
    """
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY is not set")

    client  = Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": _PROMPT + resume_text[:6000]}],
    )
    raw = message.content[0].text.strip()

    # Strip markdown code fence if Claude wrapped the JSON
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

    parsed = json.loads(raw)
    parsed["skills"] = _normalize_skills(parsed.get("skills"))
    return parsed


def _normalize_skills(skills) -> list[dict]:
    """Coerce skills into [{name, percent}], dedupe case-insensitively."""
    if not skills:
        return []
    seen: dict[str, dict] = {}
    for s in skills:
        if isinstance(s, str):
            name, percent = s, 100
        elif isinstance(s, dict) and s.get("name"):
            name = str(s["name"]).strip()
            try:
                percent = max(0, min(100, int(s.get("percent", 80))))
            except (TypeError, ValueError):
                percent = 80
        else:
            continue
        if not name:
            continue
        key = name.lower()
        # On dupe, keep the higher percent
        if key not in seen or seen[key]["percent"] < percent:
            seen[key] = {"name": name, "percent": percent}
    return list(seen.values())
