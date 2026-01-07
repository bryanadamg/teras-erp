from sqlalchemy.orm import Session
from app.models.item import Item

def create_item(
    db: Session,
    code: str,
    name: str,
    uom: str
) -> Item:
    item = Item(
        code=code,
        name=name,
        uom=uom
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_item_by_code(db: Session, code: str) -> Item | None:
    return db.query(Item).filter(Item.code == code).first()
