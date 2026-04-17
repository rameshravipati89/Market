"""
Resume parser using Claude AI (Anthropic SDK).
Raises ValueError if API key is not configured.
Raises anthropic.APIError on API failures.
"""

import json
import re

from anthropic import Anthropic

_PROMPT = """You are a resume parser. Extract structured information from the resume text below.

Return ONLY a JSON object with these exact fields (use null if not found):
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "phone number",
  "location": "City, State",
  "current_title": "current job title",
  "total_experience_years": 5,
  "skills": ["skill1", "skill2"],
  "primary_skills": ["top 5 skills"],
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
        max_tokens=1500,
        messages=[{"role": "user", "content": _PROMPT + resume_text[:6000]}],
    )
    raw = message.content[0].text.strip()

    # Strip markdown code fence if Claude wrapped the JSON
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

    return json.loads(raw)
