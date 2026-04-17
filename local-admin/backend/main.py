"""
Local Admin — Backend API
FastAPI app entry point. Connects to MongoDB and mounts all routers.
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database
from routers import candidates, mail_events

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
    log.info("[App] Backend API started.")
    yield
    log.info("[App] Backend API shutting down.")


app = FastAPI(title="Local Admin API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(mail_events.router)
app.include_router(candidates.router)
