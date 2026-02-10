const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');

let mainWindow;
let backendProcess = null;

const isDev = !app.isPackaged;
const PORT = 8000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Terras ERP',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Icon logic would go here
  });

  // Load the Frontend
  if (isDev) {
    // In dev, we might just point to the running Next.js dev server or local file
    // For this hybrid setup, we assume we are testing the production build behavior
    mainWindow.loadURL(`http://localhost:${PORT}`);
  } else {
    // In production, load static files served by the Python backend
    // OR load static files directly via file protocol if Python is just API
    // Option A: Python serves everything -> loadURL(localhost)
    // Option B: Electron serves Frontend -> loadFile(index.html)
    
    // We are choosing Option B (Hybrid): Electron serves UI, Python serves API.
    // This allows UI to load instantly even if Python is warming up.
    
    // Debugging: List files in current directory to verify structure
    console.log('Current Directory:', __dirname);
    try {
        console.log('Files in root:', fs.readdirSync(__dirname));
        if (fs.existsSync(path.join(__dirname, 'frontend_dist'))) {
            console.log('Files in frontend_dist:', fs.readdirSync(path.join(__dirname, 'frontend_dist')));
        }
    } catch (e) {
        console.error('File listing failed:', e);
    }

    const indexPath = path.join(__dirname, 'frontend_dist/index.html');
    console.log('Loading Frontend from:', indexPath);
    
    mainWindow.loadFile(indexPath).catch(err => {
        console.error('Failed to load index.html:', err);
    });

    // Helpful for debugging blank screen in production
    // You can remove this once confirmed working
    if (!isDev) {
        mainWindow.webContents.openDevTools();
    }
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startBackend() {
  let scriptPath;
  
  if (isDev) {
    console.log('Running in Dev Mode: Skipping Backend Spawn (Run it manually)');
    createWindow();
    return;
  } 
  
  // Production Path: resources/backend.exe
  const exePath = path.join(process.resourcesPath, 'backend.exe');
  
  if (!fs.existsSync(exePath)) {
    dialog.showErrorBox('Error', 'Backend executable not found at: ' + exePath);
    return;
  }

  console.log('Starting Backend from:', exePath);
  
  // Spawn the backend process
  // We can pass environment variables here if needed
  backendProcess = spawn(exePath, [], {
    cwd: process.resourcesPath, // Set CWD so it finds the .env file next to it
    env: { ...process.env, PORT: PORT.toString() } 
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });

  // Wait a moment for backend to start before showing window (optional)
  setTimeout(createWindow, 1000);
}

app.on('ready', () => {
  startBackend();
  autoUpdater.checkForUpdatesAndNotify();
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Kill the python process when app closes
  if (backendProcess) {
    backendProcess.kill();
  }
});

autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new version of Terras ERP is downloading...',
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'question',
    title: 'Update Ready',
    message: 'Update downloaded. Restart now to install?',
    buttons: ['Yes', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});
