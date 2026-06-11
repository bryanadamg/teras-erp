import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import joinedload, selectinload
from app.models.item import Item
from app.models.variant import Variant
from app.schemas import VariantCreate
from app.models.attribute import Attribute
from app.models.category import Category
from app.models.uom import UOMFactor


def _source_opts():
    return [joinedload(Item.source_sample), joinedload(Item.source_color)]


async def get_descendant_category_ids(db: AsyncSession, category_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(
        select(Category)
        .where(Category.id == category_id)
        .options(selectinload(Category.children).selectinload(Category.children))
    )
    root = result.scalar_one_or_none()
    if not root:
        return [category_id]
    ids = [root.id]
    for child in root.children:
        ids.append(child.id)
        for grandchild in child.children:
            ids.append(grandchild.id)
    return ids


async def create_item(
    db: AsyncSession,
    code: str,
    name: str,
    uom: str,
    category_id: uuid.UUID | None = None,
    source_sample_id: str | None = None,
    source_color_id: str | None = None,
    attribute_ids: list[str] = [],
    weight_per_unit: float | None = None,
    weight_unit: str | None = None,
    packaging_factor_ids: list[str] = [],
    ends: int | None = None,
    lot_tracked: bool = False,
) -> Item:
    item = Item(
        code=code,
        name=name,
        uom=uom,
        category_id=category_id,
        source_sample_id=source_sample_id,
        source_color_id=source_color_id,
        weight_per_unit=weight_per_unit,
        weight_unit=weight_unit,
        ends=ends,
        lot_tracked=lot_tracked,
    )

    if attribute_ids:
        result = await db.execute(select(Attribute).filter(Attribute.id.in_(attribute_ids)))
        attrs = result.scalars().all()
        item.attributes = attrs

    if packaging_factor_ids:
        result = await db.execute(select(UOMFactor).filter(UOMFactor.id.in_(packaging_factor_ids)))
        item.packaging_factors = result.scalars().all()

    db.add(item)
    await db.commit()

    result = await db.execute(
        select(Item)
        .options(selectinload(Item.attributes), selectinload(Item.packaging_factors), *_source_opts())
        .filter(Item.id == item.id)
    )
    return result.scalars().first()


async def update_item(
    db: AsyncSession,
    item_id: str,
    data: dict
) -> Item | None:
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.attributes), selectinload(Item.packaging_factors), *_source_opts())
        .filter(Item.id == item_id)
    )
    item = result.scalars().first()
    if not item:
        return None

    attribute_ids = data.pop("attribute_ids", None)
    packaging_factor_ids = data.pop("packaging_factor_ids", None)

    for key, value in data.items():
        if value is not None:
            setattr(item, key, value)

    if attribute_ids is not None:
        result = await db.execute(select(Attribute).filter(Attribute.id.in_(attribute_ids)))
        attrs = result.scalars().all()
        item.attributes = attrs

    if packaging_factor_ids is not None:
        result = await db.execute(select(UOMFactor).filter(UOMFactor.id.in_(packaging_factor_ids)))
        item.packaging_factors = result.scalars().all()

    await db.commit()

    result = await db.execute(
        select(Item)
        .options(selectinload(Item.attributes), selectinload(Item.packaging_factors), *_source_opts())
        .filter(Item.id == item.id)
    )
    return result.scalars().first()


async def get_item_by_code(db: AsyncSession, code: str) -> Item | None:
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.attributes), selectinload(Item.packaging_factors), *_source_opts())
        .filter(Item.code == code)
    )
    return result.scalars().first()


async def get_items(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    user=None,
    search: str = None,
    category_id: uuid.UUID | None = None,
) -> tuple[list[Item], int]:
    query = select(Item)

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(Item.code.ilike(search_filter), Item.name.ilike(search_filter))
        )

    if category_id:
        ids = await get_descendant_category_ids(db, category_id)
        query = query.filter(Item.category_id.in_(ids))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = (
        query.options(selectinload(Item.attributes), selectinload(Item.packaging_factors), *_source_opts())
        .order_by(Item.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    items = result.unique().scalars().all()
    return items, total
