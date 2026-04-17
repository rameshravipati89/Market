"""
Regex-based resume parser — used as fallback when Claude is unavailable.
Extracts common fields using heuristics and pattern matching.
"""

import re

_COMMON_SKILLS = [
    "Python", "Java", "JavaScript", "TypeScript", "React", "Angular", "Vue",
    "Node.js", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "SQL", "MongoDB",
    "PostgreSQL", "MySQL", "Redis", "Kafka", "Spark", "Hadoop", "TensorFlow",
    "PyTorch", "scikit-learn", "FastAPI", "Django", "Flask", "Spring", "C#",
    "C++", "Go", "Rust", "Scala", "R", "Tableau", "Power BI", "Linux", "Git",
    "CI/CD", "DevOps", "Terraform", "Ansible",
]

_VISA_PATTERNS = [
    (r"\b(US\s*citizen|USC)\b",              "USC"),
    (r"\bgreen\s*card\b|\bpermanent resident\b", "GC"),
    (r"\bH[-\s]?1B\b",                        "H1B"),
    (r"\bOPT\b",                               "OPT"),
    (r"\bCPT\b",                               "CPT"),
    (r"\bTN\s*visa\b|\bTN\b",                  "TN"),
    (r"\bEAD\b",                               "EAD"),
]


def parse(text: str) -> dict:
    """Return a best-effort structured dict from plain resume text."""
    email_m = re.search(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}", text)
    phone_m = re.search(
        r"(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})", text
    )

    name = None
    for line in text.split("\n")[:10]:
        line = line.strip()
        if line and re.match(r"^[A-Za-z]+([\s'-][A-Za-z]+){1,3}$", line):
            name = line
            break

    skills = [s for s in _COMMON_SKILLS
              if re.search(rf"\b{re.escape(s)}\b", text, re.IGNORECASE)]

    visa = "Unknown"
    for pattern, label in _VISA_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            visa = label
            break

    exp_m  = re.search(r"(\d+)\+?\s+years?\s+(of\s+)?experience", text, re.IGNORECASE)
    rate_m = re.search(
        r"\$?\s*(\d{2,3})\s*/?hr\b|\$?\s*(\d{2,3})\s*/\s*hour", text, re.IGNORECASE
    )

    avail = "Unknown"
    if re.search(r"\bimmediately?\s+available\b|\bimmediate\b", text, re.IGNORECASE):
        avail = "Immediate"
    elif re.search(r"\b2\s*weeks?\b", text, re.IGNORECASE):
        avail = "2 weeks"
    elif re.search(r"\b(1|one)\s*month\b", text, re.IGNORECASE):
        avail = "1 month"

    return {
        "name":                   name,
        "email":                  email_m.group(0) if email_m else None,
        "phone":                  phone_m.group(0) if phone_m else None,
        "location":               None,
        "current_title":          None,
        "total_experience_years": int(exp_m.group(1)) if exp_m else None,
        "skills":                 skills,
        "primary_skills":         skills[:5],
        "visa_status":            visa,
        "work_authorization":     None,
        "availability":           avail,
        "expected_rate":          (
            f"${rate_m.group(1) or rate_m.group(2)}/hr" if rate_m else None
        ),
        "current_employer":       None,
        "linkedin":               None,
        "summary":                None,
        "education":              [],
        "certifications":         [],
        "languages":              ["English"],
    }
