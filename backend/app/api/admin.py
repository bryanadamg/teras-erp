from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from app.core.db_manager import db_manager
from app.schemas import DatabaseResponse, ConnectionProfile
from app.api.auth import get_current_user
from app.models.auth import User
import shutil

router = APIRouter(prefix="/admin/database", tags=["admin"])

@router.get("/current", response_model=DatabaseResponse)
def get_current_db(current_user: User = Depends(get_current_user)):
    if current_user.role.name != "Administrator":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return DatabaseResponse(
        message="Current database info",
        status=True,
        data={"url": db_manager.current_url}
    )

@router.post("/switch", response_model=DatabaseResponse)
def switch_db(profile: ConnectionProfile, current_user: User = Depends(get_current_user)):
    if current_user.role.name != "Administrator":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    res = db_manager.switch_database(profile.url)
    if not res.status:
        raise HTTPException(status_code=400, detail=res.message)
    
    return res

@router.get("/snapshots")
def list_snapshots(current_user: User = Depends(get_current_user)):
    if current_user.role.name != "Administrator":
        raise HTTPException(status_code=403, detail="Not authorized")
    return db_manager.list_snapshots()

@router.post("/snapshots")
def create_snapshot(current_user: User = Depends(get_current_user)):
    if current_user.role.name != "Administrator":
        raise HTTPException(status_code=403, detail="Not authorized")
    return db_manager.create_snapshot()

@router.get("/snapshots/{filename}/download")
def download_snapshot(filename: str, current_user: User = Depends(get_current_user)):
    if current_user.role.name != "Administrator":
        raise HTTPException(status_code=403, detail="Not authorized")
    path = db_manager.get_snapshot_path(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=filename)

@router.post("/snapshots/upload")
async def upload_snapshot(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    if current_user.role.name != "Administrator":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    dest = db_manager.get_snapshot_path(file.filename)
    with dest.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"message": f"Snapshot {file.filename} uploaded", "status": True}

@router.post("/snapshots/{filename}/restore")
def restore_db(filename: str, current_user: User = Depends(get_current_user)):
    if current_user.role.name != "Administrator":
        raise HTTPException(status_code=403, detail="Not authorized")
    return db_manager.restore_snapshot(filename)
