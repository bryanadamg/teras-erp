import uvicorn
import os
import sys
from app.main import app

if __name__ == "__main__":
    # Determine port (default 8000)
    port = int(os.getenv("PORT", 8000))
    
    # Run Uvicorn
    # freeze_support is needed for PyInstaller multiprocessing on Windows
    from multiprocessing import freeze_support
    freeze_support()
    
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
