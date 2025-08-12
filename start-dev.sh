#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Vectorization App Development Environment${NC}"
echo "=============================================="

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    local process_name=$2
    echo -e "${YELLOW}Checking for processes on port $port...${NC}"
    
    # Find processes using the port
    local pids=$(lsof -ti:$port 2>/dev/null)
    
    if [ ! -z "$pids" ]; then
        echo -e "${RED}Found $process_name processes on port $port. Killing them...${NC}"
        for pid in $pids; do
            echo "Killing PID: $pid"
            kill -9 $pid 2>/dev/null
        done
        sleep 2
        echo -e "${GREEN}✅ Port $port cleared${NC}"
    else
        echo -e "${GREEN}✅ Port $port is already free${NC}"
    fi
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Kill any existing processes on our ports
echo -e "\n${BLUE}🔪 Cleaning up existing processes...${NC}"
kill_port 3000 "Frontend (Next.js)"
kill_port 3001 "Frontend Alternative"
kill_port 3002 "Backend (Express)"

# Check for required dependencies
echo -e "\n${BLUE}🔍 Checking dependencies...${NC}"

# Check Node.js
if command_exists node; then
    echo -e "${GREEN}✅ Node.js: $(node --version)${NC}"
else
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi

# Check npm
if command_exists npm; then
    echo -e "${GREEN}✅ npm: $(npm --version)${NC}"
else
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi

# Check Python3
if command_exists python3; then
    echo -e "${GREEN}✅ Python3: $(python3 --version)${NC}"
else
    echo -e "${YELLOW}⚠️  Python3 not found - OpenCV converter will not work${NC}"
fi

# Optional tools check
echo -e "\n${BLUE}🔧 Checking optional conversion tools...${NC}"

if command_exists vtracer; then
    echo -e "${GREEN}✅ VTracer: Available${NC}"
else
    echo -e "${YELLOW}⚠️  VTracer not found - VTracer converter will run in demo mode${NC}"
fi

if command_exists potrace; then
    echo -e "${GREEN}✅ Potrace: Available${NC}"
else
    echo -e "${YELLOW}⚠️  Potrace not found - Potrace converter will run in demo mode${NC}"
fi

if command_exists inkscape; then
    echo -e "${GREEN}✅ Inkscape: Available${NC}"
else
    echo -e "${YELLOW}⚠️  Inkscape not found - Inkscape converter will run in demo mode${NC}"
fi

# Navigate to project root
cd "$(dirname "$0")" || exit 1

# Verify directory structure
echo -e "\n${BLUE}📁 Verifying project structure...${NC}"

if [ ! -d "frontend" ]; then
    echo -e "${RED}❌ Frontend directory not found${NC}"
    exit 1
fi

if [ ! -d "backend" ]; then
    echo -e "${RED}❌ Backend directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Project structure verified${NC}"

# Install dependencies if needed
echo -e "\n${BLUE}📦 Installing dependencies...${NC}"

# Backend dependencies
echo -e "${YELLOW}Installing backend dependencies...${NC}"
cd backend
if [ ! -d "node_modules" ]; then
    npm install
else
    echo -e "${GREEN}✅ Backend dependencies already installed${NC}"
fi

# Frontend dependencies  
echo -e "${YELLOW}Installing frontend dependencies...${NC}"
cd ../frontend
if [ ! -d "node_modules" ]; then
    npm install
else
    echo -e "${GREEN}✅ Frontend dependencies already installed${NC}"
fi

cd ..

# Create necessary directories
echo -e "\n${BLUE}📂 Creating necessary directories...${NC}"
mkdir -p backend/uploads
mkdir -p backend/outputs
mkdir -p backend/temp
echo -e "${GREEN}✅ Directories created${NC}"

# Function to start backend
start_backend() {
    echo -e "\n${BLUE}🚀 Starting Backend Server (Port 3002)...${NC}"
    cd backend
    npm run dev &
    BACKEND_PID=$!
    cd ..
    echo -e "${GREEN}✅ Backend started with PID: $BACKEND_PID${NC}"
}

# Function to start frontend
start_frontend() {
    echo -e "\n${BLUE}🚀 Starting Frontend Server (Port 3000)...${NC}"
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..
    echo -e "${GREEN}✅ Frontend started with PID: $FRONTEND_PID${NC}"
}

# Start services
echo -e "\n${BLUE}🎬 Starting development servers...${NC}"

# Start backend first
start_backend

# Wait a moment for backend to initialize
echo -e "${YELLOW}⏳ Waiting for backend to initialize...${NC}"
sleep 5

# Test backend health
echo -e "${YELLOW}🏥 Testing backend health...${NC}"
if curl -f http://localhost:3002/api/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
fi

# Start frontend
start_frontend

# Wait for frontend to start
echo -e "${YELLOW}⏳ Waiting for frontend to initialize...${NC}"
sleep 8

# Test frontend
echo -e "${YELLOW}🏥 Testing frontend...${NC}"
if curl -f http://localhost:3000 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend is running${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend may still be starting up${NC}"
fi

# Test API proxy
echo -e "${YELLOW}🔌 Testing API proxy...${NC}"
if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ API proxy is working${NC}"
else
    echo -e "${RED}❌ API proxy test failed${NC}"
fi

# Final status
echo -e "\n${GREEN}🎉 Development Environment Started!${NC}"
echo "=============================================="
echo -e "${BLUE}Frontend:${NC} http://localhost:3000"
echo -e "${BLUE}Backend:${NC}  http://localhost:3002"
echo -e "${BLUE}API Proxy:${NC} http://localhost:3000/api/*"
echo ""
echo -e "${YELLOW}📊 Process Information:${NC}"
echo -e "Backend PID: $BACKEND_PID"
echo -e "Frontend PID: $FRONTEND_PID"
echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "- Press Ctrl+C to stop both servers"
echo "- Check browser console for any errors"
echo "- Check terminal output for server logs"
echo "- All conversions run in demo mode without external tools"
echo ""
echo -e "${BLUE}🔍 Monitoring logs...${NC}"
echo "Press Ctrl+C to stop all services"

# Trap Ctrl+C to clean up processes
trap 'echo -e "\n${RED}🛑 Stopping services...${NC}"; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT

# Keep script running and show live logs
tail -f /dev/null