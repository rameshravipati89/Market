"""
/api/pipeline — Kanban pipeline with full stage history + round tracking.

pipeline document shape:
{
  candidate_id, name, email, visa_status, availability, skills, stage,
  stage_history: [{from, to, at, notes}],
  rounds: [{
    round_id, round_number, stage, type, date, interviewer,
    result (passed|failed|pending), feedback, no_advance_reason, created_at
  }],
  notes, updated_at
}
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import database

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

STAGES = ["New Lead", "Screening", "Interview", "Offer", "Placed", "Rejected"]
ROUND_TYPES = ["HR Screen", "Technical", "Manager", "Client", "HR Final", "Other"]
ROUND_RESULTS = ["passed", "failed", "pending"]


# ── Pydantic models ───────────────────────────────────────────────────────────

class StageUpdate(BaseModel):
    stage: str
    notes: str = ""

class AddToPipelineBody(BaseModel):
    stage: str = "New Lead"
    notes: str = ""

class MoveStageBody(BaseModel):
    stage:             str
    notes:             str  = ""
    # optional round logged at the same time as the move
    log_round:         bool = False
    round_type:        str  = "HR Screen"
    round_date:        str  = ""          # ISO date string YYYY-MM-DD
    round_interviewer: str  = ""
    round_result:      str  = "pending"
    round_feedback:    str  = ""
    no_advance_reason: str  = ""          # why not moving further

class RoundBody(BaseModel):
    stage:             str  = ""
    round_type:        str  = "HR Screen"
    round_date:        str  = ""
    interviewer:       str  = ""
    result:            str  = "pending"
    feedback:          str  = ""
    no_advance_reason: str  = ""

class RoundUpdate(BaseModel):
    result:            Optional[str] = None
    feedback:          Optional[str] = None
    no_advance_reason: Optional[str] = None
    interviewer:       Optional[str] = None
    round_date:        Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _ser_entry(e: dict) -> dict:
    """Serialize a pipeline entry for the API response."""
    e["id"] = str(e.pop("_id", e.get("_id", "")))
    for k, v in list(e.items()):
        if isinstance(v, datetime):
            e[k] = v.isoformat()
    return e


# ── GET pipeline board ────────────────────────────────────────────────────────

@router.get("")
async def get_pipeline(db=Depends(database.get_db)):
    entries = await db.pipeline.find({}).to_list(None)
    by_stage = {s: [] for s in STAGES}
    for e in entries:
        _ser_entry(e)
        stage = e.get("stage", "New Lead")
        if stage not in by_stage:
            stage = "New Lead"
        by_stage[stage].append(e)
    return {"stages": STAGES, "pipeline": by_stage}


# ── GET single candidate pipeline entry ──────────────────────────────────────

@router.get("/{candidate_id}")
async def get_pipeline_entry(candidate_id: str, db=Depends(database.get_db)):
    doc = await db.pipeline.find_one({"candidate_id": candidate_id})
    if not doc:
        raise HTTPException(404, "Candidate not in pipeline")
    return _ser_entry(doc)


# ── ADD to pipeline ───────────────────────────────────────────────────────────

@router.post("/{candidate_id}")
async def add_to_pipeline(
    candidate_id: str,
    body: AddToPipelineBody,
    db=Depends(database.get_db),
):
    if body.stage not in STAGES:
        raise HTTPException(400, f"Stage must be one of: {STAGES}")

    cand = await db.candidates.find_one({"_id": ObjectId(candidate_id)})
    if not cand:
        raise HTTPException(404, "Candidate not found")

    now = _now()
    doc = {
        "candidate_id": candidate_id,
        "name":         cand.get("name", "Unknown"),
        "email":        cand.get("email", ""),
        "visa_status":  cand.get("visa_status", ""),
        "availability": cand.get("availability", ""),
        "skills":       cand.get("skills", []),
        "stage":        body.stage,
        "stage_history": [{
            "from":  None,
            "to":    body.stage,
            "at":    now,
            "notes": body.notes or "Added to pipeline",
        }],
        "rounds":       [],
        "notes":        body.notes,
        "updated_at":   now,
    }
    await db.pipeline.update_one(
        {"candidate_id": candidate_id},
        {"$set": doc},
        upsert=True,
    )
    return {"candidate_id": candidate_id, "stage": body.stage}


# ── MOVE stage (with optional round log) ─────────────────────────────────────

@router.put("/{candidate_id}/stage")
async def move_stage(
    candidate_id: str,
    body: MoveStageBody,
    db=Depends(database.get_db),
):
    if body.stage not in STAGES:
        raise HTTPException(400, f"Stage must be one of: {STAGES}")

    entry = await db.pipeline.find_one({"candidate_id": candidate_id})
    if not entry:
        raise HTTPException(404, "Candidate not in pipeline — POST first")

    now = _now()
    prev_stage = entry.get("stage", "New Lead")

    history_entry = {
        "from":  prev_stage,
        "to":    body.stage,
        "at":    now,
        "notes": body.notes,
    }

    updates: dict = {
        "stage":      body.stage,
        "notes":      body.notes,
        "updated_at": now,
    }
    push_ops: dict = {"stage_history": history_entry}

    # Optionally log a round alongside the stage move
    if body.log_round:
        existing_rounds = entry.get("rounds", [])
        round_number = len(existing_rounds) + 1
        round_doc = {
            "round_id":        str(uuid.uuid4())[:8],
            "round_number":    round_number,
            "stage":           prev_stage,
            "type":            body.round_type,
            "date":            body.round_date,
            "interviewer":     body.round_interviewer,
            "result":          body.round_result,
            "feedback":        body.round_feedback,
            "no_advance_reason": body.no_advance_reason,
            "created_at":      now,
        }
        push_ops["rounds"] = round_doc

    await db.pipeline.update_one(
        {"candidate_id": candidate_id},
        {"$set": updates, "$push": push_ops},
    )
    return {"candidate_id": candidate_id, "stage": body.stage}


# ── ROUNDS — add ─────────────────────────────────────────────────────────────

@router.post("/{candidate_id}/rounds")
async def add_round(
    candidate_id: str,
    body: RoundBody,
    db=Depends(database.get_db),
):
    entry = await db.pipeline.find_one({"candidate_id": candidate_id})
    if not entry:
        raise HTTPException(404, "Candidate not in pipeline")

    round_number = len(entry.get("rounds", [])) + 1
    now = _now()
    round_doc = {
        "round_id":        str(uuid.uuid4())[:8],
        "round_number":    round_number,
        "stage":           body.stage or entry.get("stage", ""),
        "type":            body.round_type,
        "date":            body.round_date,
        "interviewer":     body.interviewer,
        "result":          body.result,
        "feedback":        body.feedback,
        "no_advance_reason": body.no_advance_reason,
        "created_at":      now,
    }
    await db.pipeline.update_one(
        {"candidate_id": candidate_id},
        {"$push": {"rounds": round_doc}, "$set": {"updated_at": now}},
    )
    return round_doc


# ── ROUNDS — update by round_id ───────────────────────────────────────────────

@router.put("/{candidate_id}/rounds/{round_id}")
async def update_round(
    candidate_id: str,
    round_id: str,
    body: RoundUpdate,
    db=Depends(database.get_db),
):
    updates: dict = {}
    if body.result            is not None: updates["rounds.$.result"]            = body.result
    if body.feedback          is not None: updates["rounds.$.feedback"]          = body.feedback
    if body.no_advance_reason is not None: updates["rounds.$.no_advance_reason"] = body.no_advance_reason
    if body.interviewer       is not None: updates["rounds.$.interviewer"]       = body.interviewer
    if body.round_date        is not None: updates["rounds.$.date"]              = body.round_date
    if not updates:
        raise HTTPException(400, "Nothing to update")
    updates["updated_at"] = _now()

    result = await db.pipeline.update_one(
        {"candidate_id": candidate_id, "rounds.round_id": round_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Round not found")
    return {"updated": True}


# ── REMOVE from pipeline ──────────────────────────────────────────────────────

@router.delete("/{candidate_id}")
async def remove_from_pipeline(candidate_id: str, db=Depends(database.get_db)):
    result = await db.pipeline.delete_one({"candidate_id": candidate_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Not found in pipeline")
    return {"removed": candidate_id}
