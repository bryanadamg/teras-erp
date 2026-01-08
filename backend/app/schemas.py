from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

class VariantCreate(BaseModel):
    name: str
    category: str | None = None

class VariantResponse(VariantCreate):
    id: UUID
    item_id: UUID

    class Config:
        from_attributes = True

class AttributeValueCreate(BaseModel):
    value: str

class AttributeValueResponse(AttributeValueCreate):
    id: UUID
    attribute_id: UUID

    class Config:
        from_attributes = True

class AttributeCreate(BaseModel):
    name: str
    values: list[AttributeValueCreate] = []

class AttributeResponse(AttributeCreate):
    id: UUID
    values: list[AttributeValueResponse] = []

    class Config:
        from_attributes = True

class ItemCreate(BaseModel):
    code: str
    name: str
    uom: str
    variants: list[VariantCreate] = []

class ItemResponse(ItemCreate):
    id: UUID
    active: bool
    variants: list[VariantResponse] = []

    class Config:
        from_attributes = True

class StockEntryCreate(BaseModel):
    item_code: str
    location_code: str
    variant_id: UUID | None = None
    qty: float
    reference_type: str = "manual"
    reference_id: str = "manual_entry"

class StockLedgerResponse(BaseModel):
    id: UUID
    item_id: UUID
    variant_id: UUID | None
    location_id: UUID
    qty_change: float
    reference_type: str
    reference_id: str
    created_at: datetime

    class Config:
        from_attributes = True

class LocationCreate(BaseModel):
    code: str
    name: str

class LocationResponse(LocationCreate):
    id: UUID

    class Config:
        from_attributes = True
