from fastapi import APIRouter, Depends, HTTPException
from app.core.db_manager import db_manager
from app.schemas import DatabaseResponse, ConnectionProfile
from app.api.auth import get_current_user
from app.models.auth import User

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
