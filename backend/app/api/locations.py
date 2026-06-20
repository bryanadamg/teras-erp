from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.location import Location, LocationCategory
from app.models.auth import User
from app.schemas import (
    LocationCreate,
    LocationResponse,
    LocationUpdate,
    LocationCategoryCreate,
    LocationCategoryResponse,
)
from app.api.auth import get_current_user

router = APIRouter()


# --- Location Categories (flat, one level above locations) ---

@router.get("/location-categories", response_model=list[LocationCategoryResponse])
def get_location_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(LocationCategory).order_by(LocationCategory.name).all()


@router.post("/location-categories", response_model=LocationCategoryResponse, status_code=201)
def create_location_category(payload: LocationCategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    existing = db.query(LocationCategory).filter(LocationCategory.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = LocationCategory(name=name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/location-categories/{category_id}", response_model=LocationCategoryResponse)
def rename_location_category(category_id: str, payload: LocationCategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cat = db.query(LocationCategory).filter(LocationCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    dup = db.query(LocationCategory).filter(LocationCategory.name == name, LocationCategory.id != cat.id).first()
    if dup:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat.name = name
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/location-categories/{category_id}", status_code=204)
def delete_location_category(category_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cat = db.query(LocationCategory).filter(LocationCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    # FK is ON DELETE SET NULL: assigned locations become uncategorized automatically.
    db.delete(cat)
    db.commit()
    return None


# --- Locations ---

@router.post("/locations", response_model=LocationResponse)
def create_location(payload: LocationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_location = db.query(Location).filter(Location.code == payload.code).first()
    if db_location:
        raise HTTPException(status_code=400, detail="Location already exists")

    new_location = Location(
        code=payload.code,
        name=payload.name,
        category_id=payload.category_id,
    )
    db.add(new_location)
    db.commit()
    db.refresh(new_location)
    return new_location


@router.get("/locations", response_model=list[LocationResponse])
def get_locations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Location).offset(skip).limit(limit).all()


@router.patch("/locations/{location_id}", response_model=LocationResponse)
def update_location(location_id: str, payload: LocationUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    # exclude_unset so omitted fields are untouched but explicit null clears category.
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        location.name = data["name"]
    if "category_id" in data:
        location.category_id = data["category_id"]
    db.commit()
    db.refresh(location)
    return location


@router.delete("/locations/{location_id}")
def delete_location(location_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    db.delete(location)
    db.commit()
    return {"status": "success", "message": "Location deleted"}
