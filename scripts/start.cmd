@echo off
REM Vector Converter - Cross-platform startup script for Windows
REM This script sets up and starts both the backend and frontend services

title Vector Converter Startup

echo.
echo 🚀 Vector Converter Startup Script
echo ==================================
echo.

REM Check if we're in the correct directory
if not exist "README.md" (
    echo [ERROR] Please run this script from the vectorization-app root directory
    pause
    exit /b 1
)

if not exist "frontend" (
    echo [ERROR] Frontend directory not found
    pause
    exit /b 1
)

if not exist "backend" (
    echo [ERROR] Backend directory not found
    pause
    exit /b 1
)

REM Function to check Node.js
echo [INFO] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Please install Node.js 18 or higher.
    echo [ERROR] Download from: https://nodejs.org/
    pause
    exit /b 1
) else (
    echo [SUCCESS] Node.js is available
    node --version
)

REM Check npm
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not available
    pause
    exit /b 1
) else (
    echo [SUCCESS] npm is available
)

REM Function to check Python
echo [INFO] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    python3 --version >nul 2>&1
    if errorlevel 1 (
        echo [WARNING] Python is not installed. OpenCV converter will not be available.
        echo [INFO] To enable OpenCV converter, install Python 3 and opencv-python
        set PYTHON_AVAILABLE=false
    ) else (
        echo [SUCCESS] Python3 is available
        python3 --version
        set PYTHON_CMD=python3
        set PYTHON_AVAILABLE=true
    )
) else (
    python --version | findstr "Python 3" >nul
    if errorlevel 1 (
        echo [ERROR] Python 2 detected. Python 3 is required for OpenCV converter.
        set PYTHON_AVAILABLE=false
    ) else (
        echo [SUCCESS] Python is available
        python --version
        set PYTHON_CMD=python
        set PYTHON_AVAILABLE=true
    )
)

REM Check Python packages if Python is available
if "%PYTHON_AVAILABLE%"=="true" (
    echo [INFO] Checking Python dependencies...
    %PYTHON_CMD% -c "import cv2" >nul 2>&1
    if errorlevel 1 (
        echo [WARNING] OpenCV not found. Attempting to install...
        pip install opencv-python numpy
        if errorlevel 1 (
            echo [ERROR] Failed to install OpenCV. Please install manually: pip install opencv-python numpy
        ) else (
            echo [SUCCESS] OpenCV installed successfully
        )
    ) else (
        echo [SUCCESS] OpenCV is available
    )
    
    %PYTHON_CMD% -c "import numpy" >nul 2>&1
    if errorlevel 1 (
        echo [WARNING] NumPy not found. It should be installed with OpenCV.
    ) else (
        echo [SUCCESS] NumPy is available
    )
)

REM Check VTracer
echo [INFO] Checking VTracer installation...
vtracer --version >nul 2>&1
if errorlevel 1 (
    echo [WARNING] VTracer is not installed. VTracer converter will not be available.
    echo [INFO] To install VTracer:
    echo [INFO]   - Download from: https://github.com/visioncortex/vtracer
    echo [INFO]   - Or install via cargo: cargo install vtracer
) else (
    echo [SUCCESS] VTracer is available
    vtracer --version
)

echo.

REM Check if dependencies need to be installed
if not exist "backend\node_modules" (
    set INSTALL_DEPS=true
) else if not exist "frontend\node_modules" (
    set INSTALL_DEPS=true
) else (
    set INSTALL_DEPS=false
    echo [SUCCESS] Dependencies already installed
)

REM Install dependencies if needed
if "%INSTALL_DEPS%"=="true" (
    echo [INFO] Installing dependencies...
    
    echo [INFO] Installing backend dependencies...
    cd backend
    if not exist "package.json" (
        echo [ERROR] Backend package.json not found
        pause
        exit /b 1
    )
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install backend dependencies
        pause
        exit /b 1
    )
    echo [SUCCESS] Backend dependencies installed
    cd ..
    
    echo [INFO] Installing frontend dependencies...
    cd frontend
    if not exist "package.json" (
        echo [ERROR] Frontend package.json not found
        pause
        exit /b 1
    )
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies
        pause
        exit /b 1
    )
    echo [SUCCESS] Frontend dependencies installed
    cd ..
    
    echo.
)

REM Create necessary directories
if not exist "backend\uploads" mkdir backend\uploads
if not exist "backend\outputs" mkdir backend\outputs

echo [INFO] Starting services...
echo.

REM Start backend
echo [INFO] Starting backend server...
cd backend
start "Vector Converter Backend" cmd /c "npm run dev"
cd ..

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend
echo [INFO] Starting frontend server...
cd frontend
start "Vector Converter Frontend" cmd /c "npm run dev"
cd ..

echo.
echo [SUCCESS] Services started successfully!
echo.
echo 📡 Backend running at:  http://localhost:3002
echo 🌐 Frontend running at: http://localhost:3000
echo.
echo Press any key to open the application in your browser...
pause >nul

REM Try to open browser
start http://localhost:3000

echo.
echo Services are running in separate windows.
echo Close those windows or press Ctrl+C in them to stop the services.
echo.
pause