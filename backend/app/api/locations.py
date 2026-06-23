from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.db.session import get_db
from app.models.location import Location
from app.models.auth import User
from app.schemas import LocationCreate, LocationResponse, LocationUpdate
from app.api.auth import get_current_user

router = APIRouter()


def _assert_parent_ok(db: Session, parent_id, *, moving_id=None):
    """Validate a parent assignment for the 2-level warehouse→spot hierarchy."""
    if parent_id is None:
        return
    if moving_id and str(parent_id) == str(moving_id):
        raise HTTPException(status_code=400, detail="A location cannot be its own parent")
    parent = db.query(Location).filter(Location.id == parent_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent location not found")
    if parent.parent_id is not None:
        raise HTTPException(status_code=400, detail="Only two levels allowed (parent must be a top-level warehouse)")
    # Moving a location that already has children would create a 3rd level.
    if moving_id and db.query(Location).filter(Location.parent_id == moving_id).first():
        raise HTTPException(status_code=400, detail="This location has sub-locations; move or remove them first")


@router.post("/locations", response_model=LocationResponse)
def create_location(payload: LocationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if db.query(Location).filter(Location.code == payload.code).first():
        raise HTTPException(status_code=400, detail="Location already exists")
    _assert_parent_ok(db, payload.parent_id)
    loc = Location(code=payload.code, name=payload.name, parent_id=payload.parent_id)
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.get("/locations", response_model=list[LocationResponse])
def get_locations(skip: int = 0, limit: int = 1000, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Location).offset(skip).limit(limit).all()
    # Resolve parent_name / has_children from the flat list (no relationship IO —
    # the model's relationship-backed properties are kept async-safe for nested
    # serialization and intentionally return defaults when unloaded).
    name_by_id = {r.id: r.name for r in rows}
    parents_with_children = {r.parent_id for r in rows if r.parent_id}
    return [
        LocationResponse(
            id=r.id,
            code=r.code,
            name=r.name,
            parent_id=r.parent_id,
            parent_name=name_by_id.get(r.parent_id),
            has_children=r.id in parents_with_children,
        )
        for r in rows
    ]


@router.patch("/locations/{location_id}", response_model=LocationResponse)
def update_location(location_id: str, payload: LocationUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        loc.name = data["name"]
    if "parent_id" in data:
        _assert_parent_ok(db, data["parent_id"], moving_id=loc.id)
        loc.parent_id = data["parent_id"]
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/locations/{location_id}")
def delete_location(location_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    if db.query(Location).filter(Location.parent_id == loc.id).first():
        raise HTTPException(status_code=400, detail="Remove sub-locations first")
    db.delete(loc)
    db.commit()
    return {"status": "success", "message": "Location deleted"}
