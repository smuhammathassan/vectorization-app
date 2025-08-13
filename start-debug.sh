#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐛 Starting Vectorization App in DEBUG MODE${NC}"
echo "=============================================="

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    local process_name=$2
    echo -e "${YELLOW}Killing processes on port $port...${NC}"
    
    # More aggressive port killing
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
    fuser -k ${port}/tcp 2>/dev/null || true
    sleep 1
    
    echo -e "${GREEN}✅ Port $port cleared${NC}"
}

# Navigate to project root
cd "$(dirname "$0")" || exit 1

# Kill existing processes
echo -e "\n${BLUE}🔪 Aggressively cleaning up ports...${NC}"
kill_port 3000 "Frontend"
kill_port 3001 "Frontend Alt"  
kill_port 3002 "Backend"

# Additional cleanup
echo -e "${YELLOW}Killing any remaining node processes...${NC}"
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "nodemon" 2>/dev/null || true
sleep 2

echo -e "\n${BLUE}📂 Creating necessary directories...${NC}"
mkdir -p backend/uploads
mkdir -p backend/outputs  
mkdir -p backend/temp

echo -e "\n${BLUE}🚀 Starting Backend in DEBUG mode...${NC}"
cd backend
echo -e "${GREEN}Backend starting at: $(pwd)${NC}"
echo -e "${YELLOW}Backend will run on: http://localhost:3002${NC}"
echo -e "${YELLOW}API endpoints: http://localhost:3002/api/*${NC}"
npm run dev &
BACKEND_PID=$!
echo -e "${GREEN}✅ Backend PID: $BACKEND_PID${NC}"

cd ..

# Wait for backend
echo -e "\n${YELLOW}⏳ Waiting 8 seconds for backend to fully start...${NC}"
sleep 8

# Test backend thoroughly
echo -e "\n${BLUE}🏥 Testing backend endpoints...${NC}"

echo -e "${YELLOW}Testing /api/health...${NC}"
if curl -f http://localhost:3002/api/health; then
    echo -e "\n${GREEN}✅ Backend health OK${NC}"
else
    echo -e "\n${RED}❌ Backend health FAILED${NC}"
fi

echo -e "\n${YELLOW}Testing /api/methods...${NC}"
if curl -f http://localhost:3002/api/methods; then
    echo -e "\n${GREEN}✅ Methods endpoint OK${NC}"
else
    echo -e "\n${RED}❌ Methods endpoint FAILED${NC}"
fi

echo -e "\n${BLUE}🚀 Starting Frontend in DEBUG mode...${NC}"
cd frontend
echo -e "${GREEN}Frontend starting at: $(pwd)${NC}"
echo -e "${YELLOW}Frontend will run on: http://localhost:3000${NC}"
echo -e "${YELLOW}API Proxy: http://localhost:3000/api/* -> http://localhost:3002/api/*${NC}"
npm run dev &
FRONTEND_PID=$!
echo -e "${GREEN}✅ Frontend PID: $FRONTEND_PID${NC}"

cd ..

# Wait for frontend  
echo -e "\n${YELLOW}⏳ Waiting 10 seconds for frontend to fully start...${NC}"
sleep 10

# Test frontend and proxy
echo -e "\n${BLUE}🏥 Testing frontend and API proxy...${NC}"

echo -e "${YELLOW}Testing frontend root...${NC}"
if curl -f http://localhost:3000 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend root OK${NC}"
else
    echo -e "${RED}❌ Frontend root FAILED${NC}"
fi

echo -e "${YELLOW}Testing API proxy /api/health...${NC}"
if curl -f http://localhost:3000/api/health; then
    echo -e "\n${GREEN}✅ API Proxy health OK${NC}"
else
    echo -e "\n${RED}❌ API Proxy health FAILED${NC}"
fi

echo -e "\n${YELLOW}Testing API proxy /api/methods...${NC}"
if curl -f http://localhost:3000/api/methods; then
    echo -e "\n${GREEN}✅ API Proxy methods OK${NC}"
else
    echo -e "\n${RED}❌ API Proxy methods FAILED${NC}"
fi

# Final status
echo -e "\n${GREEN}🎉 DEBUG MODE READY!${NC}"
echo "=============================================="
echo -e "${BLUE}🌐 URLs:${NC}"
echo -e "  Frontend:     http://localhost:3000"
echo -e "  Backend:      http://localhost:3002"
echo -e "  API Health:   http://localhost:3000/api/health"
echo -e "  API Methods:  http://localhost:3000/api/methods"
echo ""
echo -e "${BLUE}📊 Process Info:${NC}"
echo -e "  Backend PID:  $BACKEND_PID"
echo -e "  Frontend PID: $FRONTEND_PID"
echo ""
echo -e "${YELLOW}🐛 DEBUG INSTRUCTIONS:${NC}"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Open browser DevTools (F12)"
echo "3. Upload a file and try to convert"
echo "4. Check console for any errors"
echo "5. Check this terminal for server logs"
echo ""
echo -e "${RED}To stop: Press Ctrl+C or run: kill $BACKEND_PID $FRONTEND_PID${NC}"
echo ""
echo -e "${BLUE}🔍 Monitoring... (Press Ctrl+C to stop)${NC}"

# Trap Ctrl+C to clean up
trap 'echo -e "\n${RED}🛑 Stopping all services...${NC}"; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT

# Keep running
tail -f /dev/null