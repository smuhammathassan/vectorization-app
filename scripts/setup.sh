#!/bin/bash

# Vector Converter - Development setup script
# This script sets up the development environment with all dependencies

set -e

echo "🔧 Vector Converter Development Setup"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if command_exists apt-get; then
            DISTRO="ubuntu"
        elif command_exists yum; then
            DISTRO="redhat"
        elif command_exists pacman; then
            DISTRO="arch"
        else
            DISTRO="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        DISTRO="macos"
    else
        OS="unknown"
        DISTRO="unknown"
    fi
    
    print_status "Detected OS: $OS ($DISTRO)"
}

# Install Node.js
install_nodejs() {
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            print_success "Node.js $(node --version) is already installed"
            return
        fi
    fi
    
    print_status "Installing Node.js..."
    
    if [ "$OS" == "macos" ]; then
        if command_exists brew; then
            brew install node
        else
            print_error "Homebrew not found. Please install Node.js manually from https://nodejs.org/"
            exit 1
        fi
    elif [ "$OS" == "linux" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif [ "$DISTRO" == "redhat" ]; then
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
            sudo yum install -y nodejs npm
        elif [ "$DISTRO" == "arch" ]; then
            sudo pacman -S nodejs npm
        else
            print_error "Unsupported Linux distribution. Please install Node.js manually."
            exit 1
        fi
    else
        print_error "Unsupported OS. Please install Node.js manually from https://nodejs.org/"
        exit 1
    fi
    
    print_success "Node.js installed successfully"
}

# Install Python and dependencies
install_python() {
    if command_exists python3; then
        print_success "Python3 is already installed: $(python3 --version)"
    else
        print_status "Installing Python3..."
        
        if [ "$OS" == "macos" ]; then
            if command_exists brew; then
                brew install python
            else
                print_error "Homebrew not found. Please install Python3 manually."
                exit 1
            fi
        elif [ "$OS" == "linux" ]; then
            if [ "$DISTRO" == "ubuntu" ]; then
                sudo apt-get update
                sudo apt-get install -y python3 python3-pip
            elif [ "$DISTRO" == "redhat" ]; then
                sudo yum install -y python3 python3-pip
            elif [ "$DISTRO" == "arch" ]; then
                sudo pacman -S python python-pip
            else
                print_error "Unsupported Linux distribution. Please install Python3 manually."
                exit 1
            fi
        fi
        
        print_success "Python3 installed successfully"
    fi
    
    # Install Python packages
    print_status "Installing Python packages for OpenCV converter..."
    
    PIP_CMD="pip3"
    if ! command_exists pip3; then
        PIP_CMD="pip"
    fi
    
    if command_exists $PIP_CMD; then
        $PIP_CMD install --user opencv-python numpy
        print_success "Python packages installed successfully"
    else
        print_warning "pip not found. Please install opencv-python and numpy manually."
    fi
}

# Install VTracer
install_vtracer() {
    if command_exists vtracer; then
        print_success "VTracer is already installed: $(vtracer --version 2>&1 || echo 'unknown version')"
        return
    fi
    
    print_status "Installing VTracer..."
    
    if command_exists cargo; then
        print_status "Installing VTracer via Cargo..."
        cargo install vtracer
        print_success "VTracer installed successfully"
    else
        print_warning "Cargo not found. Attempting to download pre-built binary..."
        
        # Download pre-built binary based on OS
        VTRACER_URL=""
        VTRACER_FILE=""
        
        if [ "$OS" == "linux" ]; then
            VTRACER_URL="https://github.com/visioncortex/vtracer/releases/latest/download/vtracer-linux-x86_64"
            VTRACER_FILE="vtracer"
        elif [ "$OS" == "macos" ]; then
            VTRACER_URL="https://github.com/visioncortex/vtracer/releases/latest/download/vtracer-macos-x86_64"
            VTRACER_FILE="vtracer"
        fi
        
        if [ -n "$VTRACER_URL" ]; then
            curl -L "$VTRACER_URL" -o "/tmp/$VTRACER_FILE"
            chmod +x "/tmp/$VTRACER_FILE"
            
            # Try to install to /usr/local/bin
            if sudo mv "/tmp/$VTRACER_FILE" /usr/local/bin/; then
                print_success "VTracer installed to /usr/local/bin/"
            else
                # Fallback to local installation
                mkdir -p ~/.local/bin
                mv "/tmp/$VTRACER_FILE" ~/.local/bin/
                print_success "VTracer installed to ~/.local/bin/"
                print_warning "Make sure ~/.local/bin is in your PATH"
            fi
        else
            print_warning "Could not download VTracer binary for your OS."
            print_status "Please install VTracer manually:"
            print_status "  1. Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
            print_status "  2. Install VTracer: cargo install vtracer"
            print_status "  3. Or download from: https://github.com/visioncortex/vtracer/releases"
        fi
    fi
}

# Install additional tools
install_additional_tools() {
    print_status "Installing additional development tools..."
    
    # Install Rust (for VTracer compilation if needed)
    if ! command_exists cargo && [ "$1" != "--skip-rust" ]; then
        print_status "Installing Rust toolchain..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
        print_success "Rust installed successfully"
    fi
}

# Setup project
setup_project() {
    print_status "Setting up project structure..."
    
    # Create necessary directories
    mkdir -p backend/uploads backend/outputs backend/src/scripts
    mkdir -p frontend/src/components
    
    # Make scripts executable
    chmod +x scripts/start.sh
    
    print_success "Project structure created"
}

# Install project dependencies
install_project_deps() {
    print_status "Installing project dependencies..."
    
    # Backend dependencies
    if [ -d "backend" ] && [ -f "backend/package.json" ]; then
        print_status "Installing backend dependencies..."
        cd backend
        npm install
        cd ..
        print_success "Backend dependencies installed"
    fi
    
    # Frontend dependencies
    if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
        print_status "Installing frontend dependencies..."
        cd frontend
        npm install
        cd ..
        print_success "Frontend dependencies installed"
    fi
}

# Main setup function
main() {
    detect_os
    
    print_status "Starting development environment setup..."
    echo
    
    install_nodejs
    install_python
    install_additional_tools "$@"
    install_vtracer
    
    echo
    setup_project
    install_project_deps
    
    echo
    print_success "🎉 Development environment setup complete!"
    echo
    print_status "You can now start the application with:"
    print_status "  ./scripts/start.sh"
    echo
    print_status "Available conversion methods will depend on installed tools:"
    
    if command_exists vtracer; then
        print_success "  ✓ VTracer - High-quality vectorization"
    else
        print_warning "  ✗ VTracer - Not available (install with: cargo install vtracer)"
    fi
    
    if command_exists python3 && python3 -c "import cv2" 2>/dev/null; then
        print_success "  ✓ OpenCV - Contour-based conversion"
    else
        print_warning "  ✗ OpenCV - Not available (install with: pip3 install opencv-python)"
    fi
    
    echo
    print_status "For additional converters, refer to the documentation in docs/"
}

# Run setup
main "$@"