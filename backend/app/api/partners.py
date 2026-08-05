from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas import PartnerCreate, PartnerResponse, PartnerUpdate, PaginatedPartnerResponse
from app.models.partner import Partner
from app.models.audit import AuditLog
from app.api.auth import get_current_user, require_permission, require_any_permission, user_has_permission
from app.models.auth import User
from typing import List, Optional
import uuid

router = APIRouter(prefix="/partners", tags=["partners"])

@router.post("", response_model=PartnerResponse)
def create_partner(payload: PartnerCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    required = 'customer.create' if str(payload.type).upper().endswith('CUSTOMER') else 'supplier.create'
    if not user_has_permission(current_user, required):
        raise HTTPException(status_code=403, detail=f"Missing permission: {required}")
    partner = Partner(
        name=payload.name,
        address=payload.address,
        contact_person=payload.contact_person,
        phone=payload.phone,
        fax=payload.fax,
        email=payload.email,
        type=payload.type,
        active=payload.active
    )
    db.add(partner)
    db.commit()
    db.refresh(partner)
    db.add(AuditLog(user_id=current_user.id, action="CREATE", entity_type="partner", entity_id=str(partner.id), details=f"Created partner {partner.name}"))
    db.commit()
    return partner

@router.get("", response_model=PaginatedPartnerResponse)
def get_partners(
    type: Optional[str] = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Partner)
    if type:
        query = query.filter(Partner.type == type)
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    page = (skip // limit) + 1 if limit else 1
    return {"items": items, "total": total, "page": page, "size": limit}

@router.put("/{partner_id}", response_model=PartnerResponse)
def update_partner(partner_id: uuid.UUID, payload: PartnerUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    partner = db.query(Partner).filter(Partner.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    required = 'customer.edit' if str(partner.type).upper().endswith('CUSTOMER') else 'supplier.edit'
    if not user_has_permission(current_user, required):
        raise HTTPException(status_code=403, detail=f"Missing permission: {required}")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(partner, key, value)

    db.add(AuditLog(user_id=current_user.id, action="UPDATE", entity_type="partner", entity_id=str(partner.id), details=f"Updated partner {partner.name}"))
    db.commit()
    db.refresh(partner)
    return partner

@router.delete("/{partner_id}")
def delete_partner(partner_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    partner = db.query(Partner).filter(Partner.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    required = 'customer.delete' if str(partner.type).upper().endswith('CUSTOMER') else 'supplier.delete'
    if not user_has_permission(current_user, required):
        raise HTTPException(status_code=403, detail=f"Missing permission: {required}")

    try:
        db.add(AuditLog(
            user_id=current_user.id,
            action="DELETE",
            entity_type="partner",
            entity_id=str(partner.id),
            details=f"Deleted partner {partner.name}"
        ))
        db.delete(partner)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Cannot delete '{partner.name}': they are referenced by existing records")
    return {"status": "success"}
