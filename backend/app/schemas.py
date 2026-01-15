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
    attribute_value_ids: list[UUID] = []
    qty: float

class BOMLineResponse(BaseModel):
    id: UUID
    item_id: UUID
    attribute_value_ids: list[UUID] = [] # We'll populate this in the API
    qty: float

    class Config:
        from_attributes = True

class BOMOperationCreate(BaseModel):
    operation_id: UUID
    work_center_id: UUID | None = None
    sequence: int = 10
    time_minutes: float = 0.0

class BOMOperationResponse(BaseModel):
    id: UUID
    operation_id: UUID
    work_center_id: UUID | None
    sequence: int
    time_minutes: float

    class Config:
        from_attributes = True

class BOMCreate(BaseModel):
    code: str
    description: str | None = None
    item_code: str
    attribute_value_ids: list[UUID] = []
    qty: float = 1.0
    lines: list[BOMLineCreate]
    operations: list[BOMOperationCreate] = []

class BOMResponse(BaseModel):
    id: UUID
    code: str
    description: str | None
    item_id: UUID
    attribute_value_ids: list[UUID] = [] # We'll populate this in the API
    qty: float
    active: bool
    lines: list[BOMLineResponse]
    operations: list[BOMOperationResponse] = []

    class Config:
        from_attributes = True

class WorkOrderCreate(BaseModel):
    code: str
    bom_id: UUID
    location_code: str
    qty: float
    start_date: datetime | None = None
    due_date: datetime | None = None

class WorkOrderResponse(BaseModel):
    id: UUID
    code: str
    bom_id: UUID
    item_id: UUID
    attribute_value_ids: list[UUID] = [] # We'll populate this in the API
    location_id: UUID
    qty: float
    status: str
    start_date: datetime | None
    due_date: datetime | None
    completed_at: datetime | None
    created_at: datetime
    is_material_available: bool = True # Calculated field
    
    class Config:
        from_attributes = True

class ItemCreate(BaseModel):
    code: str
    name: str
    uom: str
    category: str | None = None
    attribute_ids: list[UUID] = []
    source_sample_id: UUID | None = None

class ItemUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    uom: str | None = None
    category: str | None = None
    attribute_ids: list[UUID] | None = None
    source_sample_id: UUID | None = None
    active: bool | None = None

class ItemResponse(ItemCreate):
    id: UUID
    active: bool

    class Config:
        from_attributes = True

class StockEntryCreate(BaseModel):
    item_code: str
    location_code: str
    attribute_value_ids: list[UUID] = []
    qty: float
    reference_type: str = "manual"
    reference_id: str = "manual_entry"

class StockLedgerResponse(BaseModel):
    id: UUID
    item_id: UUID
    attribute_value_ids: list[UUID] = []
    location_id: UUID
    qty_change: float
    reference_type: str
    reference_id: str
    created_at: datetime

    class Config:
        from_attributes = True

class StockBalanceResponse(BaseModel):
    item_id: UUID
    attribute_value_ids: list[UUID] = []
    location_id: UUID
    qty: float

class LocationCreate(BaseModel):
    code: str
    name: str

class LocationResponse(LocationCreate):
    id: UUID

    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name: str

class CategoryResponse(CategoryCreate):
    id: UUID

    class Config:
        from_attributes = True

class WorkCenterCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    cost_per_hour: float = 0.0

class WorkCenterResponse(WorkCenterCreate):
    id: UUID

    class Config:
        from_attributes = True

class OperationCreate(BaseModel):
    code: str
    name: str
    description: str | None = None

class OperationResponse(OperationCreate):
    id: UUID

    class Config:
        from_attributes = True

# --- Auth Schemas ---

class PermissionBase(BaseModel):
    code: str
    description: str

class PermissionResponse(PermissionBase):
    id: UUID
    class Config:
        from_attributes = True

class RoleBase(BaseModel):
    name: str
    description: str | None = None

class RoleCreate(RoleBase):
    permission_ids: list[UUID] = []

class RoleResponse(RoleBase):
    id: UUID
    permissions: list[PermissionResponse] = []
    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str
    full_name: str
    role_id: UUID | None = None

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: UUID
    role: RoleResponse | None = None
    class Config:
        from_attributes = True
