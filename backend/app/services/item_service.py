from sqlalchemy.orm import Session
from app.models.item import Item
from app.models.variant import Variant
from app.schemas import VariantCreate

def create_item(
    db: Session,
    code: str,
    name: str,
    uom: str,
    variants: list[VariantCreate] = []
) -> Item:
    item = Item(
        code=code,
        name=name,
        uom=uom
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    for v in variants:
        variant = Variant(item_id=item.id, name=v.name, category=v.category)
        db.add(variant)
    
    db.commit()
    db.refresh(item)
    return item


def get_item_by_code(db: Session, code: str) -> Item | None:
    return db.query(Item).filter(Item.code == code).first()


def get_items(db: Session, skip: int = 0, limit: int = 100) -> list[Item]:
    return db.query(Item).offset(skip).limit(limit).all()
