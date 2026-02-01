import os
import subprocess
import shutil

def build_backend():
    print("Building Backend with PyInstaller...")
    
    # Ensure dist directory exists
    if os.path.exists("dist"):
        shutil.rmtree("dist")
    
    # Run PyInstaller
    # --onefile: Bundle everything into one exe
    # --name: Name of the exe
    # --hidden-import: Ensure key libs are included
    command = [
        "pyinstaller",
        "--onefile",
        "--name", "backend",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols",
        "--hidden-import", "uvicorn.protocols.http",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.lifespan",
        "--hidden-import", "uvicorn.lifespan.on",
        "--hidden-import", "engineio.async_drivers.asgi",
        "--hidden-import", "sqlalchemy.ext.baked", 
        "backend/run_server.py"
    ]
    
    subprocess.check_call(command)
    
    # Move to Electron resources
    target_dir = "electron/resources"
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)
        
    shutil.move("dist/backend.exe", os.path.join(target_dir, "backend.exe"))
    print(f"Backend build complete. Moved to {target_dir}/backend.exe")

if __name__ == "__main__":
    build_backend()
