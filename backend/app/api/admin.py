from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import text
from app.core.db_manager import db_manager
from app.core.ws_manager import manager as ws_manager
from app.schemas import DatabaseResponse, ConnectionProfile
from app.api.auth import get_current_admin
from app.models.auth import User
from pathlib import Path
from urllib.parse import urlparse, urlunparse
import shutil
import time

router = APIRouter(prefix="/admin/database", tags=["admin"])

@router.get("/status")
async def get_system_status(current_user: User = Depends(get_current_admin)):
    result = {
        "db": {"ok": False, "latency_ms": None},
        "redis": {"ok": False, "latency_ms": None},
        "db_size_bytes": None,
    }
    try:
        if db_manager.async_engine:
            start = time.perf_counter()
            async with db_manager.async_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
                size = await conn.execute(text("SELECT pg_database_size(current_database())"))
                result["db_size_bytes"] = size.scalar()
            result["db"]["ok"] = True
            result["db"]["latency_ms"] = round((time.perf_counter() - start) * 1000, 1)
    except Exception:
        pass
    try:
        start = time.perf_counter()
        if ws_manager.redis and await ws_manager.redis.ping():
            result["redis"]["ok"] = True
            result["redis"]["latency_ms"] = round((time.perf_counter() - start) * 1000, 1)
    except Exception:
        pass
    return result

@router.get("/current", response_model=DatabaseResponse)
def get_current_db(current_user: User = Depends(get_current_admin)):
    parsed = urlparse(db_manager.current_url)
    masked = parsed._replace(
        netloc=parsed.netloc.replace(f":{parsed.password}@", ":***@") if parsed.password else parsed.netloc
    )
    safe_url = urlunparse(masked)

    return DatabaseResponse(
        message="Current database info",
        status=True,
        data={"url": safe_url}
    )

@router.post("/switch", response_model=DatabaseResponse)
def switch_db(profile: ConnectionProfile, current_user: User = Depends(get_current_admin)):
    res = db_manager.switch_database(profile.url)
    if not res.status:
        raise HTTPException(status_code=400, detail=res.message)

    return res

@router.get("/snapshots")
def list_snapshots(current_user: User = Depends(get_current_admin)):
    return db_manager.list_snapshots()

@router.post("/snapshots")
async def create_snapshot(current_user: User = Depends(get_current_admin)):
    return await db_manager.create_snapshot()

@router.get("/snapshots/{filename}/download")
def download_snapshot(filename: str, current_user: User = Depends(get_current_admin)):
    path = db_manager.get_snapshot_path(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=filename)

@router.post("/snapshots/upload")
async def upload_snapshot(file: UploadFile = File(...), current_user: User = Depends(get_current_admin)):
    safe_filename = Path(file.filename).name
    dest = db_manager.get_snapshot_path(safe_filename)
    with dest.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"message": f"Snapshot {safe_filename} uploaded", "status": True}

@router.post("/snapshots/{filename}/restore")
async def restore_db(filename: str, current_user: User = Depends(get_current_admin)):
    return await db_manager.restore_snapshot(filename)
