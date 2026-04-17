"""
Pydantic models for request bodies and shared response shapes.
"""

from typing import Optional

from pydantic import BaseModel


class CandidateUpdate(BaseModel):
    expected_rate: Optional[str] = None
    visa_status:   Optional[str] = None
    availability:  Optional[str] = None
    current_title: Optional[str] = None
    location:      Optional[str] = None
