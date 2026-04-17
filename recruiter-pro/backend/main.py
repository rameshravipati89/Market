"""
RecruitIQ Pro — Backend API
FastAPI entry point. Shared MongoDB with mail-injector and local-admin.
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database
from routers import candidates, dashboard, mails, pipeline, profiles, skill_profiles

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

MONGO_URI = os.environ["MONGO_URI"]
MONGO_DB  = os.environ.get("MONGO_DB", "maildb")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect(MONGO_URI, MONGO_DB)
    log.info("[App] RecruitIQ Pro API started.")
    yield
    log.info("[App] RecruitIQ Pro API shutting down.")


app = FastAPI(
    title="RecruitIQ Pro API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(profiles.router)
app.include_router(mails.router)
app.include_router(candidates.router)
app.include_router(pipeline.router)
app.include_router(skill_profiles.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
