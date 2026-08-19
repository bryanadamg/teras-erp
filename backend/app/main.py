from pathlib import Path
from fastapi import FastAPI, Request, APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, ORJSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
import os
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import mimetypes
from fastapi.staticfiles import StaticFiles

class _HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/health" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_HealthCheckFilter())

from app.db.session import engine
from app.core.db_manager import db_manager
from app.db.base import Base
from app.api import items, locations, stock, attributes, boms, manufacturing, categories, routing, auth, uoms, sales, samples, audit, admin, dashboard, partners, purchase, settings, production_runs, work_orders, batches, dyeing_setting, preferences, lab_dips, packing, pick_lists, shipments, colors, combos, weaving, print_templates, production_reports, quarantine, work_queue
from app.core.ws_manager import manager

# Keep in sync with /VERSION, frontend/package.json "version", and CHANGELOG.md on release.
APP_VERSION = "0.3.1"

# Process start time, a proxy for "last deployed/updated" — deploy is git pull +
# docker compose up --build, which always restarts this process.
_STARTED_AT = datetime.now(timezone.utc)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Redis for WebSockets
    await manager.initialize()
    # Warm the booking-netting cache off the request path (see warm_booking_cache).
    stock.warm_booking_cache()
    yield
    # Shutdown: Close Redis connections
    await manager.stop()

app = FastAPI(
    title="Terras ERP",
    version=APP_VERSION,
    default_response_class=ORJSONResponse,
    lifespan=lifespan
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logging.error("422 Validation Error on %s %s: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

# Ensure .jpeg is recognized on minimal Linux images that lack a full mime.types db
mimetypes.add_type("image/jpeg", ".jpeg")

# Mount Static Files
static_path = Path("static")
static_path.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Router Configuration ---
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
api_router.include_router(settings.router)
api_router.include_router(production_runs.router)
api_router.include_router(work_orders.router)
api_router.include_router(work_queue.router)
api_router.include_router(batches.router)
api_router.include_router(dyeing_setting.router)
api_router.include_router(lab_dips.router)
api_router.include_router(colors.router)
api_router.include_router(combos.router)
api_router.include_router(packing.router)
api_router.include_router(quarantine.router)
api_router.include_router(pick_lists.router)
api_router.include_router(shipments.router)
api_router.include_router(weaving.router)
api_router.include_router(preferences.router)
api_router.include_router(print_templates.router)
api_router.include_router(production_reports.router)

@api_router.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            # App-level heartbeat: reply to client pings so the browser can detect
            # a dead/idle connection (native WS ping/pong isn't exposed to JS) and
            # so proxies don't drop an otherwise-silent long-lived socket.
            if raw:
                try:
                    msg = json.loads(raw)
                    if isinstance(msg, dict) and msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@api_router.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION, "started_at": _STARTED_AT.isoformat()}

@api_router.get("/health/ready")
async def health_readiness():
    checks = {"db": "fail", "redis": "fail"}
    # DB probe
    try:
        if db_manager.async_engine:
            async with db_manager.async_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
                checks["db"] = "ok"
    except Exception:
        pass
    # Redis probe
    try:
        if manager.redis and await manager.redis.ping():
            checks["redis"] = "ok"
    except Exception:
        pass

    all_ok = all(v == "ok" for v in checks.values())
    status_code = 200 if all_ok else 503
    return ORJSONResponse({"status": "ready" if all_ok else "degraded", **checks}, status_code=status_code)

app.include_router(api_router, prefix="/api")
# ----------------------------

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

origins = os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:3000,http://localhost:3030").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress large JSON/list responses over the wire. Pure transport optimization —
# no API contract change. Responses below minimum_size are sent uncompressed.
# compresslevel=6 (not the default 9): near-identical ratio at much lower CPU cost,
# which matters on the low-power ARM backend host.
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)

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
