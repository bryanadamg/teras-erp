from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services import stock_service
from app.schemas import StockLedgerResponse

router = APIRouter()

@router.get("/stock", response_model=list[StockLedgerResponse])
def get_stock_ledger(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return stock_service.get_stock_entries(db, skip=skip, limit=limit)
