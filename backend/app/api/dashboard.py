from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services import kpi_service
from app.api.auth import get_current_user
from app.models.auth import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/kpis")
def get_dashboard_kpis(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # You can choose to refresh if data is old, or just return cache
    return kpi_service.get_all_cached_kpis(db)

@router.post("/kpis/refresh")
def refresh_kpis(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    kpi_service.refresh_all_kpis(db)
    return {"status": "success"}
