"""
Auth router — POST /api/login  +  get_current_user dependency
"""

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

SECRET_KEY     = os.environ.get("JWT_SECRET",       "local-admin-jwt-secret-2024")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME",   "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD",   "admin")
ALGORITHM      = "HS256"
TOKEN_EXPIRE_H = 8

security = HTTPBearer()

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


def _create_token() -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_H)
    return jwt.encode({"sub": "admin", "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    try:
        jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    return "admin"


@router.post("/api/login")
async def login(body: LoginRequest):
    if body.username != ADMIN_USERNAME or body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"token": _create_token()}
