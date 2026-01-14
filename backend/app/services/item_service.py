from sqlalchemy.orm import Session
from app.models.item import Item
from app.models.variant import Variant
from app.schemas import VariantCreate

from app.models.attribute import Attribute

def create_item(
    db: Session,
    code: str,
    name: str,
    uom: str,
    category: str | None = None,
    source_sample_id: str | None = None,
    attribute_ids: list[str] = []
) -> Item:
    item = Item(
        code=code,
        name=name,
        uom=uom,
        category=category,
        source_sample_id=source_sample_id
    )
    
    if attribute_ids:
        attrs = db.query(Attribute).filter(Attribute.id.in_(attribute_ids)).all()
        item.attributes = attrs

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
    
    attribute_ids = data.pop("attribute_ids", None)
    
    for key, value in data.items():
        if value is not None:
            setattr(item, key, value)
            
    if attribute_ids is not None:
        attrs = db.query(Attribute).filter(Attribute.id.in_(attribute_ids)).all()
        item.attributes = attrs
            
    db.commit()
    db.refresh(item)
    return item


def get_item_by_code(db: Session, code: str) -> Item | None:
    return db.query(Item).filter(Item.code == code).first()


def get_items(db: Session, skip: int = 0, limit: int = 100) -> list[Item]:
    return db.query(Item).offset(skip).limit(limit).all()
