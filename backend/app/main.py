from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from app.db.session import engine
from app.db.base import Base
from app.api import items, locations, stock, attributes, boms

app = FastAPI(title="Teras ERP")

def run_migrations():
    """
    Run ad-hoc migrations to fix schema discrepancies.
    This is a simple alternative to Alembic for this dev setup.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("COMMIT")) # Ensure clean state
            
            # 1. Add variant_id to stock_ledger if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES variants(id)"))
                conn.execute(text("COMMIT"))
                print("Migration: Verified variant_id in stock_ledger")
            except Exception as e:
                pass

            # 2. Drop legacy 'variant' column from items
            try:
                conn.execute(text("ALTER TABLE items DROP COLUMN IF EXISTS variant"))
                conn.execute(text("COMMIT"))
                print("Migration: Verified cleanup of items table")
            except Exception as e:
                pass

    except Exception as e:
        print(f"Migration failed: {e}")

Base.metadata.create_all(bind=engine)
run_migrations()

app.include_router(items.router)
app.include_router(locations.router)
app.include_router(stock.router)
app.include_router(attributes.router)
app.include_router(boms.router)




BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "app_name": "Teras ERP",
            "version": "0.1.0"
        }
    )

@app.get("/health")
async def health():
    return {"status": "ok"}
