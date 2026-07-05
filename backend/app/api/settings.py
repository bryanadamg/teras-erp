from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_async_db
from app.schemas import CompanyProfileResponse, CompanyProfileUpdate
from app.models.settings import CompanyProfile
from app.api.auth import get_current_user, get_current_admin
from app.models.auth import User
from app.services import audit_service
import shutil
import os
from pathlib import Path

router = APIRouter(prefix="/settings", tags=["settings"])

UPLOAD_DIR = Path("static/logos")

@router.get("/company", response_model=CompanyProfileResponse)
async def get_company_profile(db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(CompanyProfile))
    profile = result.scalars().first()
    if not profile:
        # Create a default one if it doesn't exist
        profile = CompanyProfile(name="My Company")
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile

@router.put("/company", response_model=CompanyProfileResponse)
async def update_company_profile(
    payload: CompanyProfileUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_admin)
):
    result = await db.execute(select(CompanyProfile))
    profile = result.scalars().first()
    if not profile:
        profile = CompanyProfile()
        db.add(profile)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    await audit_service.log_activity(db, current_user.id, "UPDATE", "CompanyProfile", str(profile.id), details="Updated company profile")
    return profile

@router.post("/company/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_admin)
):
    # Ensure dir exists
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    # Save file
    file_ext = os.path.splitext(file.filename)[1]
    file_path = UPLOAD_DIR / f"company_logo{file_ext}"
    
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update profile
    result = await db.execute(select(CompanyProfile))
    profile = result.scalars().first()
    if not profile:
        profile = CompanyProfile()
        db.add(profile)
    
    # Store relative URL
    profile.logo_url = f"/static/logos/company_logo{file_ext}"
    await db.commit()
    await audit_service.log_activity(db, current_user.id, "UPDATE", "CompanyProfile", str(profile.id), details="Uploaded company logo")

    return {"logo_url": profile.logo_url}
