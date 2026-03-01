from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import joinedload
from app.models.item import Item
from app.models.variant import Variant
from app.schemas import VariantCreate
from app.models.attribute import Attribute

async def create_item(
    db: AsyncSession,
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
        result = await db.execute(select(Attribute).filter(Attribute.id.in_(attribute_ids)))
        attrs = result.scalars().all()
        item.attributes = attrs

    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def update_item(
    db: AsyncSession,
    item_id: str,
    data: dict
) -> Item | None:
    result = await db.execute(select(Item).filter(Item.id == item_id))
    item = result.scalars().first()
    if not item:
        return None
    
    attribute_ids = data.pop("attribute_ids", None)
    
    for key, value in data.items():
        if value is not None:
            setattr(item, key, value)
            
    if attribute_ids is not None:
        result = await db.execute(select(Attribute).filter(Attribute.id.in_(attribute_ids)))
        attrs = result.scalars().all()
        item.attributes = attrs
            
    await db.commit()
    await db.refresh(item)
    return item


async def get_item_by_code(db: AsyncSession, code: str) -> Item | None:
    result = await db.execute(select(Item).filter(Item.code == code))
    return result.scalars().first()


async def get_items(db: AsyncSession, skip: int = 0, limit: int = 100, user=None, search: str = None, category: str = None) -> tuple[list[Item], int]:
    query = select(Item)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                Item.code.ilike(search_filter),
                Item.name.ilike(search_filter)
            )
        )

    if category:
        query = query.filter(Item.category == category)

    if user and user.allowed_categories:
        query = query.filter(Item.category.in_(user.allowed_categories))
    
    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Get paginated results
    query = query.options(joinedload(Item.attributes)).offset(skip).limit(limit)
    result = await db.execute(query)
    items = result.unique().scalars().all()
    
    return items, total
