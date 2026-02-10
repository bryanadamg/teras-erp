import os
import subprocess
import shutil
import sys

def run_command(command, cwd=None, shell=True):
    print(f"Executing: {' '.join(command) if isinstance(command, list) else command} in {cwd or 'root'}")
    try:
        subprocess.check_call(command, cwd=cwd, shell=shell)
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {e}")
        sys.exit(1)

def build_production():
    root_dir = os.getcwd()
    
    print("--- STEP 1: Building Frontend (Static Export) ---")
    run_command("npm install", cwd=os.path.join(root_dir, "frontend"))
    run_command("npm run build", cwd=os.path.join(root_dir, "frontend"))
    
    # Copy frontend output to electron folder for consistent pathing
    electron_frontend_dir = os.path.join(root_dir, "electron", "frontend_dist")
    if os.path.exists(electron_frontend_dir):
        shutil.rmtree(electron_frontend_dir)
    shutil.copytree(os.path.join(root_dir, "frontend", "out"), electron_frontend_dir)
    print(f"Copied frontend build to {electron_frontend_dir}")

    print("\n--- STEP 2: Compiling Backend (PyInstaller) ---")
    # Ensure dependencies are installed for build
    run_command("pip install -r backend/requirements.txt pyinstaller", shell=True)
    run_command([sys.executable, "build_backend_setup.py"])

    print("\n--- STEP 3: Packaging Desktop Installer (Electron) ---")
    electron_dir = os.path.join(root_dir, "electron")
    
    # Ensure resources folder exists for production env file
    resources_dir = os.path.join(electron_dir, "resources")
    if not os.path.exists(resources_dir):
        os.makedirs(resources_dir)
    
    # CLEANUP: Remove previous build artifacts to ensure clean packaging
    dist_dir = os.path.join(electron_dir, "dist")
    if os.path.exists(dist_dir):
        print(f"Cleaning previous build artifacts in {dist_dir}...")
        shutil.rmtree(dist_dir)
    
    # Check if a production .env exists, if not, copy example as a placeholder
    prod_env = os.path.join(resources_dir, ".env.production")
    if not os.path.exists(prod_env):
        print("Warning: .env.production not found in electron/resources. Using .env.example as template.")
        shutil.copy(".env.example", prod_env)

    run_command("npm install", cwd=electron_dir)
    # This creates the final .exe in electron/dist/
    run_command("npm run dist", cwd=electron_dir)

    print("\n" + "="*50)
    print("SUCCESS: Installer generated!")
    print(f"Location: {os.path.join(electron_dir, 'dist')}")
    print("IMPORTANT: You must RUN this new installer to update your application.")
    print("The error you saw earlier persists only because you are running the OLD installed version.")
    print("="*50)

if __name__ == "__main__":
    build_production()
