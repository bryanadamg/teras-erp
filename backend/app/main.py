from pathlib import Path
from fastapi import FastAPI, Request, APIRouter
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import os

from app.db.session import engine
from app.db.base import Base
from app.api import items, locations, stock, attributes, boms, manufacturing, categories, routing, auth, uoms, sales, samples, audit, admin, dashboard, partners, purchase
from app.db.init_db import init_db

app = FastAPI(title="Terras ERP")

# Initialize Database and run migrations
init_db()

# --- Router Configuration ---
# Create a central API router to group all endpoints
api_router = APIRouter()

api_router.include_router(items.router)
api_router.include_router(locations.router)
api_router.include_router(stock.router)
api_router.include_router(attributes.router)
api_router.include_router(boms.router)
api_router.include_router(manufacturing.router)
api_router.include_router(categories.router)
api_router.include_router(routing.router)
api_router.include_router(auth.router)
api_router.include_router(uoms.router)
api_router.include_router(sales.router)
api_router.include_router(samples.router)
api_router.include_router(audit.router)
api_router.include_router(admin.router)
api_router.include_router(dashboard.router)
api_router.include_router(partners.router)
api_router.include_router(purchase.router)

@api_router.get("/health")
async def health():
    return {"status": "ok"}

# Include the central router with the global prefix
app.include_router(api_router, prefix="/api")
# ----------------------------

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Security: Configure CORS from environment
origins = os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:3000,http://localhost:3030").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "app_name": "Terras ERP",
            "version": "0.1.0"
        }
    )