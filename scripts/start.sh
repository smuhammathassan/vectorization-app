#!/bin/bash

# Vector Converter - Cross-platform startup script for Unix/macOS
# This script sets up and starts both the backend and frontend services

set -e  # Exit on any error

echo "🚀 Vector Converter Startup Script"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the correct directory
if [ ! -f "README.md" ] || [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    print_error "Please run this script from the vectorization-app root directory"
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            print_error "Node.js version 18 or higher is required. Current version: $(node --version)"
            exit 1
        fi
        print_success "Node.js version: $(node --version)"
    else
        print_error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    fi
}

# Function to check Python
check_python() {
    if command_exists python3; then
        PYTHON_CMD="python3"
        PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
        print_success "Python3 version: $PYTHON_VERSION"
    elif command_exists python; then
        PYTHON_CMD="python"
        PYTHON_VERSION=$(python --version 2>&1 | cut -d' ' -f2)
        if [[ $PYTHON_VERSION == 2.* ]]; then
            print_error "Python 3 is required for OpenCV converter. Please install Python 3."
            PYTHON_CMD=""
        else
            print_success "Python version: $PYTHON_VERSION"
        fi
    else
        print_warning "Python is not installed. OpenCV converter will not be available."
        PYTHON_CMD=""
    fi

    # Check for required Python packages if Python is available
    if [ -n "$PYTHON_CMD" ]; then
        print_status "Checking Python dependencies..."
        
        if $PYTHON_CMD -c "import cv2" 2>/dev/null; then
            print_success "OpenCV (cv2) is available"
        else
            print_warning "OpenCV not found. Installing..."
            if command_exists pip3; then
                pip3 install opencv-python numpy
            elif command_exists pip; then
                pip install opencv-python numpy
            else
                print_error "pip is not available. Please install opencv-python and numpy manually."
            fi
        fi

        if $PYTHON_CMD -c "import numpy" 2>/dev/null; then
            print_success "NumPy is available"
        else
            print_warning "NumPy not found. It should be installed with OpenCV."
        fi
    fi
}

# Function to check VTracer
check_vtracer() {
    if command_exists vtracer; then
        VTRACER_VERSION=$(vtracer --version 2>&1 || echo "unknown")
        print_success "VTracer is available: $VTRACER_VERSION"
    else
        print_warning "VTracer is not installed. VTracer converter will not be available."
        print_status "To install VTracer:"
        print_status "  - Download from: https://github.com/visioncortex/vtracer"
        print_status "  - Or install via cargo: cargo install vtracer"
    fi
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Backend dependencies
    print_status "Installing backend dependencies..."
    cd backend
    if [ -f "package.json" ]; then
        npm install
        print_success "Backend dependencies installed"
    else
        print_error "Backend package.json not found"
        exit 1
    fi
    cd ..

    # Frontend dependencies
    print_status "Installing frontend dependencies..."
    cd frontend
    if [ -f "package.json" ]; then
        npm install
        print_success "Frontend dependencies installed"
    else
        print_error "Frontend package.json not found"
        exit 1
    fi
    cd ..
}

# Function to start services
start_services() {
    print_status "Starting services..."
    
    # Create necessary directories
    mkdir -p backend/uploads backend/outputs
    
    # Start backend in background
    print_status "Starting backend server..."
    cd backend
    npm run dev &
    BACKEND_PID=$!
    cd ..
    
    # Wait a moment for backend to start
    sleep 3
    
    # Start frontend in background
    print_status "Starting frontend server..."
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..
    
    print_success "Services started successfully!"
    echo ""
    echo "📡 Backend running at:  http://localhost:3002"
    echo "🌐 Frontend running at: http://localhost:3000"
    echo ""
    echo "Press Ctrl+C to stop all services"
    
    # Function to cleanup on exit
    cleanup() {
        print_status "Shutting down services..."
        if [ -n "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
            kill $BACKEND_PID
            print_success "Backend stopped"
        fi
        if [ -n "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
            kill $FRONTEND_PID
            print_success "Frontend stopped"
        fi
        exit 0
    }
    
    # Set up signal handlers
    trap cleanup SIGINT SIGTERM
    
    # Wait for services (keep script running)
    wait
}

# Main execution
main() {
    print_status "Checking system requirements..."
    
    check_node_version
    check_python
    check_vtracer
    
    echo ""
    
    # Check if dependencies need to be installed
    if [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
        install_dependencies
        echo ""
    else
        print_success "Dependencies already installed"
    fi
    
    start_services
}

# Run main function
main "$@"