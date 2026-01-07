from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services.item_service import create_item

router = APIRouter()

@router.post("/items")
def create_item_api(payload: dict, db: Session = Depends(get_db)):
    return create_item(
        db,
        code=payload["code"],
        name=payload["name"],
        uom=payload["uom"]
    )
