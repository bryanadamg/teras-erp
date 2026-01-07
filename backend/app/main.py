from fastapi import FastAPI

app = FastAPI(title="Teras ERP")

@app.get("/health")
def health():
    return {"status": "ok"}
