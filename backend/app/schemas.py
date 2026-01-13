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

class AttributeValueUpdate(BaseModel):
    value: str

class AttributeValueResponse(AttributeValueCreate):
    id: UUID
    attribute_id: UUID

    class Config:
        from_attributes = True

class AttributeCreate(BaseModel):
    name: str
    values: list[AttributeValueCreate] = []

class AttributeUpdate(BaseModel):
    name: str

class AttributeResponse(AttributeCreate):
    id: UUID
    values: list[AttributeValueResponse] = []

    class Config:
        from_attributes = True

class BOMLineCreate(BaseModel):
    item_code: str
    variant_id: UUID | None = None
    qty: float

class BOMLineResponse(BaseModel):
    id: UUID
    item_id: UUID
    variant_id: UUID | None
    qty: float

    class Config:
        from_attributes = True

class BOMCreate(BaseModel):
    code: str
    description: str | None = None
    item_code: str
    variant_id: UUID | None = None
    qty: float = 1.0
    lines: list[BOMLineCreate]

class BOMResponse(BaseModel):
    id: UUID
    code: str
    description: str | None
    item_id: UUID
    variant_id: UUID | None
    qty: float
    active: bool
    lines: list[BOMLineResponse]

    class Config:
        from_attributes = True

class WorkOrderCreate(BaseModel):
    code: str
    bom_id: UUID
    qty: float
    start_date: datetime | None = None
    due_date: datetime | None = None

class WorkOrderResponse(BaseModel):
    id: UUID
    code: str
    bom_id: UUID
    item_id: UUID
    variant_id: UUID | None
    qty: float
    status: str
    start_date: datetime | None
    due_date: datetime | None
    created_at: datetime
    
    # Optional nested details could be added here if needed, 
    # but for now we keep it flat for the table view.

    class Config:
        from_attributes = True

class ItemCreate(BaseModel):
    code: str
    name: str
    uom: str
    category: str | None = None
    variants: list[VariantCreate] = []

class ItemUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    uom: str | None = None
    category: str | None = None
    active: bool | None = None

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
