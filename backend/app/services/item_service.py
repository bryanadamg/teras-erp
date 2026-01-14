from sqlalchemy.orm import Session
from app.models.item import Item
from app.models.variant import Variant
from app.schemas import VariantCreate

def create_item(
    db: Session,
    code: str,
    name: str,
    uom: str,
    category: str | None = None,
    source_sample_id: str | None = None,
    attribute_id: str | None = None
) -> Item:
    item = Item(
        code=code,
        name=name,
        uom=uom,
        category=category,
        source_sample_id=source_sample_id,
        attribute_id=attribute_id
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(
    db: Session,
    item_id: str,
    data: dict
) -> Item | None:
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        return None
    
    for key, value in data.items():
        if value is not None:
            setattr(item, key, value)
            
    db.commit()
    db.refresh(item)
    return item


def get_item_by_code(db: Session, code: str) -> Item | None:
    return db.query(Item).filter(Item.code == code).first()


def get_items(db: Session, skip: int = 0, limit: int = 100) -> list[Item]:
    return db.query(Item).offset(skip).limit(limit).all()
