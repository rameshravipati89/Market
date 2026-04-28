"""
Pydantic models for request bodies and shared response shapes.
"""

from typing import Optional

from pydantic import BaseModel, Field


class SkillItem(BaseModel):
    name: str
    percent: int = Field(default=100, ge=0, le=100)


class EducationItem(BaseModel):
    degree:      Optional[str] = None
    institution: Optional[str] = None
    year:        Optional[str] = None


class CandidateUpdate(BaseModel):
    name:                   Optional[str]              = None
    email:                  Optional[str]              = None
    phone:                  Optional[str]              = None
    location:               Optional[str]              = None
    current_title:          Optional[str]              = None
    current_employer:       Optional[str]              = None
    total_experience_years: Optional[int]              = None
    skills:                 Optional[list[SkillItem]]  = None
    primary_skills:         Optional[list[str]]        = None
    visa_status:            Optional[str]              = None
    work_authorization:     Optional[str]              = None
    availability:           Optional[str]              = None
    expected_rate:          Optional[str]              = None
    linkedin:               Optional[str]              = None
    summary:                Optional[str]              = None
    education:              Optional[list[EducationItem]] = None
    certifications:         Optional[list[str]]        = None
    languages:              Optional[list[str]]        = None
