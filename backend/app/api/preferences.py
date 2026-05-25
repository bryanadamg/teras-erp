from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_async_db
from app.api.auth import get_current_user
from app.models.auth import User, UserPreference
from app.schemas import UserPreferenceUpsert, UserPreferenceResponse

router = APIRouter()


@router.get("/preferences/{key}", response_model=UserPreferenceResponse)
async def get_preference(
    key: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == current_user.id,
            UserPreference.key == key,
        )
    )
    pref = result.scalar_one_or_none()
    if not pref:
        raise HTTPException(status_code=404, detail="Preference not found")
    return pref


@router.put("/preferences/{key}", response_model=UserPreferenceResponse)
async def upsert_preference(
    key: str,
    payload: UserPreferenceUpsert,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == current_user.id,
            UserPreference.key == key,
        )
    )
    pref = result.scalar_one_or_none()
    if pref:
        pref.value = payload.value
    else:
        pref = UserPreference(user_id=current_user.id, key=key, value=payload.value)
        db.add(pref)
    await db.commit()
    await db.refresh(pref)
    return pref
