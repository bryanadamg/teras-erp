from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.kpi import KPICache
from app.models.item import Item
from app.models.manufacturing import WorkOrder
from app.models.stock_ledger import StockLedger
from datetime import datetime, timedelta

def get_kpi(db: Session, key: str, ttl_minutes: int = 10):
    """Retrieves a KPI from cache or returns None if expired."""
    cached = db.query(KPICache).filter(KPICache.key == key).first()
    if cached and (datetime.utcnow() - cached.updated_at) < timedelta(minutes=ttl_minutes):
        return cached.value
    return None

def update_kpi(db: Session, key: str, value: float):
    cached = db.query(KPICache).filter(KPICache.key == key).first()
    if cached:
        cached.value = value
        cached.updated_at = datetime.utcnow()
    else:
        db.add(KPICache(key=key, value=value))
    db.commit()

def refresh_all_kpis(db: Session):
    """Calculates all KPIs and updates the cache."""
    # 1. Total Items
    total_items = db.query(Item).count()
    update_kpi(db, "total_items", float(total_items))

    # 2. Active Work Orders
    active_wo = db.query(WorkOrder).filter(WorkOrder.status == "IN_PROGRESS").count()
    update_kpi(db, "active_wo", float(active_wo))

    # 3. Pending Work Orders
    pending_wo = db.query(WorkOrder).filter(WorkOrder.status == "PENDING").count()
    update_kpi(db, "pending_wo", float(pending_wo))

    # Add more as needed...
    return True

def get_all_cached_kpis(db: Session):
    """Returns all cached KPIs as a dictionary."""
    kpis = db.query(KPICache).all()
    # If cache is empty, refresh it
    if not kpis:
        refresh_all_kpis(db)
        kpis = db.query(KPICache).all()
    
    return {k.key: k.value for k in kpis}
