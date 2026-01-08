from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

class ItemCreate(BaseModel):
    code: str
    name: str
    uom: str

class ItemResponse(ItemCreate):
    id: UUID
    active: bool

    class Config:
        from_attributes = True

class StockEntryCreate(BaseModel):
    item_code: str
    location_code: str
    qty: float
    reference_type: str = "manual"
    reference_id: str = "manual_entry"

class StockLedgerResponse(BaseModel):
    id: UUID
    item_id: UUID
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
