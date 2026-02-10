from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services import stock_service
from app.schemas import StockLedgerResponse, StockBalanceResponse
from app.models.auth import User
from app.api.auth import get_current_user
from app.models.item import Item
from datetime import datetime
from typing import Optional

router = APIRouter()

@router.get("/stock", response_model=list[StockLedgerResponse])
def get_stock_ledger(
    skip: int = 0, 
    limit: int = 100, 
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.stock_ledger import StockLedger
    query = db.query(StockLedger)
    
    if start_date:
        query = query.filter(StockLedger.created_at >= start_date)
    if end_date:
        query = query.filter(StockLedger.created_at <= end_date)
        
    if current_user.allowed_categories:
        query = query.join(Item, StockLedger.item_id == Item.id).filter(Item.category.in_(current_user.allowed_categories))
        
    return query.order_by(StockLedger.created_at.desc()).offset(skip).limit(limit).all()

@router.get("/stock/balance", response_model=list[StockBalanceResponse])
def get_stock_balance_api(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return stock_service.get_all_stock_balances(db, user=current_user)
