"""
Auth router for RecruitIQ Pro.

Two roles:
  - admin     → username/password from env (shared with local-admin)
  - recruiter → email + password from MongoDB `credentials` collection
                (the same IMAP credentials managed in local-admin → Mail Injection)

Recruiters see only mail_events where `fetched_for == their email`.
Admin sees everything.
"""

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

import database

SECRET_KEY     = os.environ.get("JWT_SECRET",     "local-admin-jwt-secret-2024")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")
ALGORITHM      = "HS256"
TOKEN_EXPIRE_H = 8

security = HTTPBearer()
router   = APIRouter()


class LoginRequest(BaseModel):
    username: str   # admin username OR recruiter email
    password: str


def _create_token(role: str, email: str | None = None) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_H)
    payload = {"sub": email or role, "role": role, "exp": exp}
    if email:
        payload["email"] = email
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Return {"role": "admin"} or {"role": "recruiter", "email": "<recruiter email>"}.
    Raises 401 on bad/expired token.
    """
    try:
        payload = jwt.decode(cred.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    role = payload.get("role")
    if role == "admin":
        return {"role": "admin"}
    if role == "recruiter" and payload.get("email"):
        return {"role": "recruiter", "email": payload["email"]}
    raise HTTPException(status_code=401, detail="Invalid token payload")


@router.post("/api/login")
async def login(body: LoginRequest):
    # 1) Admin shortcut
    if body.username == ADMIN_USERNAME and body.password == ADMIN_PASSWORD:
        return {"token": _create_token("admin"), "role": "admin"}

    # 2) Recruiter — match against credentials collection
    db = database.get_db()
    cred = await db.credentials.find_one({
        "type":   "imap",
        "user":   body.username.strip().lower(),
        "active": True,
    })
    if cred and cred.get("password") == body.password:
        return {
            "token": _create_token("recruiter", email=cred["user"]),
            "role":  "recruiter",
            "email": cred["user"],
        }

    raise HTTPException(status_code=401, detail="Invalid email or password")
