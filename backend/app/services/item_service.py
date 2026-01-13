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
    variants: list[VariantCreate] = []
) -> Item:
    item = Item(
        code=code,
        name=name,
        uom=uom,
        category=category
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


def add_variant_to_item(db: Session, item_id: str, variant_data: VariantCreate):
    variant = Variant(item_id=item_id, name=variant_data.name, category=variant_data.category)
    db.add(variant)
    db.commit()
    db.refresh(variant)
    return variant


def delete_variant(db: Session, variant_id: str):
    variant = db.query(Variant).filter(Variant.id == variant_id).first()
    if variant:
        db.delete(variant)
        db.commit()
    return variant


def get_item_by_code(db: Session, code: str) -> Item | None:
    return db.query(Item).filter(Item.code == code).first()


def get_items(db: Session, skip: int = 0, limit: int = 100) -> list[Item]:
    return db.query(Item).offset(skip).limit(limit).all()
