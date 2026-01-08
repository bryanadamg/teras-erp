from pydantic import BaseModel
from uuid import UUID

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
