from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from app.db.session import engine
from app.db.base import Base
from app.api import items, locations, stock

app = FastAPI(title="Teras ERP")
Base.metadata.create_all(bind=engine)
app.include_router(items.router)
app.include_router(locations.router)
app.include_router(stock.router)




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
