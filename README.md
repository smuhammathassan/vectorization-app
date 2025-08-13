# Vector Converter - Professional Raster-to-Vector Conversion

A comprehensive, cross-platform application that transforms raster images into high-quality vector graphics using multiple state-of-the-art conversion algorithms.

![Vector Converter Interface](docs/images/interface-preview.png)

## ✨ Features

### 🎯 **Multiple Conversion Methods**
- **VTracer**: Modern full-color vectorization with advanced clustering
- **OpenCV**: Contour-based conversion with scientific precision
- **Potrace**: Traditional binary image tracing (planned)
- **Inkscape**: Professional-grade conversion via command line (planned)

### 📁 **File Support**
- **Input Formats**: PNG, JPEG, BMP, TIFF, WEBP
- **Output Formats**: SVG (primary), PDF, EPS, AI (planned)
- **Batch Processing**: Convert multiple files simultaneously
- **Large Files**: Support for images up to 50MB

### 🖥️ **Modern Interface**
- Drag-and-drop file upload
- Real-time conversion progress
- Parameter customization for each method
- Side-by-side result comparison
- Download management

### ⚙️ **Technical Features**
- Cross-platform compatibility (Windows, macOS, Linux)
- RESTful API architecture
- SQLite database for job tracking
- Background processing with job queues
- Comprehensive error handling

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)
```bash
# Clone and setup everything automatically
git clone <repository-url> vectorization-app
cd vectorization-app

# Run setup script (installs dependencies and tools)
./scripts/setup.sh      # Unix/macOS
# or
scripts\setup.cmd       # Windows

# Start the application
./scripts/start.sh      # Unix/macOS  
# or
scripts\start.cmd       # Windows
```

### Option 2: Manual Setup
```bash
# Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Start backend (terminal 1)
cd backend && npm run dev

# Start frontend (terminal 2)  
cd frontend && npm run dev
```

**Access the application at**: http://localhost:3000

## 📋 System Requirements

### Required
- **Node.js** 18+ (for application core)
- **npm** or **yarn** (package management)

### Optional (for conversion methods)
- **Python 3.7+** + **OpenCV** (for OpenCV converter)
- **VTracer binary** (for VTracer converter)
- **Rust + Cargo** (to build VTracer from source)

## 🔧 Installation Guide

### 1. System Dependencies

#### **macOS**
```bash
# Using Homebrew
brew install node python

# Install Python packages
pip3 install opencv-python numpy

# Install VTracer
cargo install vtracer
# or download binary from releases
```

#### **Ubuntu/Debian**
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python and OpenCV
sudo apt-get install python3 python3-pip
pip3 install opencv-python numpy

# Install VTracer (via Rust)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
cargo install vtracer
```

#### **Windows**
1. Install Node.js from [nodejs.org](https://nodejs.org/)
2. Install Python from [python.org](https://python.org/)
3. Install OpenCV: `pip install opencv-python numpy`
4. Download VTracer binary from [releases](https://github.com/visioncortex/vtracer/releases)

### 2. Application Setup

```bash
# Clone repository
git clone <repository-url> vectorization-app
cd vectorization-app

# Install application dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Create required directories
mkdir -p backend/uploads backend/outputs
```

## 🎨 Usage Guide

### Basic Workflow

1. **Upload Images**: Drag and drop or click to select raster images
2. **Choose Method**: Select conversion algorithm (VTracer, OpenCV, etc.)
3. **Configure Parameters**: Adjust settings for optimal results
4. **Convert**: Click convert to start the vectorization process
5. **Download**: Get your SVG files when conversion completes

### Method Comparison

| Method | Speed | Quality | Best For | Color Support |
|--------|-------|---------|----------|---------------|
| **VTracer** | Medium | Excellent | Complex images, logos | Full color |
| **OpenCV** | Fast | Good | Line art, simple graphics | Grayscale/Binary |
| **Potrace** | Fast | Good | Binary images, text | Black & white |

### Parameter Tuning Tips

#### **VTracer Settings**
- **Color Precision (1-8)**: Higher = more colors, larger files
- **Layer Difference (0-255)**: Lower = more detail, more paths
- **Mode**: Spline for smooth curves, Polygon for sharp edges

#### **OpenCV Settings**
- **Threshold (0-255)**: Adjust based on image contrast
- **Epsilon**: Higher = more simplified paths
- **Min Area**: Filter out small noise elements

## 🏗️ Architecture

### Project Structure
```
vectorization-app/
├── frontend/              # Next.js React application
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Application pages
│   │   └── utils/         # Frontend utilities
├── backend/               # Express.js API server
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   ├── services/      # Business logic
│   │   ├── converters/    # Conversion implementations
│   │   └── middleware/    # Express middleware
├── shared/                # Shared TypeScript types
├── scripts/               # Setup and startup scripts
└── docs/                  # Documentation
```

### Technology Stack

**Frontend**
- Next.js 14+ with TypeScript
- Tailwind CSS for styling
- React Hook Form for form handling
- Lucide React for icons

**Backend**
- Express.js with TypeScript
- SQLite database
- Sharp for image processing
- Multer for file uploads

**Conversion Methods**
- VTracer (Rust binary)
- OpenCV via Python
- Custom SVG generation

## 🔌 API Reference

### Core Endpoints

#### Upload Files
```http
POST /api/upload
Content-Type: multipart/form-data

# Single file
Body: file=<image_file>

# Multiple files  
Body: files[]=<image_file_1>&files[]=<image_file_2>
```

#### Start Conversion
```http
POST /api/convert
Content-Type: application/json

{
  "fileId": "uploaded_file_id",
  "method": "vtracer|opencv",
  "parameters": {
    "colorPrecision": 6,
    "threshold": 128
  }
}
```

#### Check Status
```http
GET /api/convert/{jobId}/status

Response: {
  "success": true,
  "data": {
    "status": "processing|completed|failed",
    "progress": 75,
    "estimatedTime": 5000
  }
}
```

#### Download Result
```http
GET /api/convert/{jobId}/result
# Returns SVG file for download
```

## 🧪 Development

### Development Setup
```bash
# Start development servers
npm run dev:backend   # Backend with hot reload
npm run dev:frontend  # Frontend with hot reload

# Or use the startup script
./scripts/start.sh
```

### Adding New Converters

1. Implement the `IConverter` interface:
```typescript
export class MyConverter implements IConverter {
  name = 'my-converter';
  description = 'My custom conversion method';
  // ... implement required methods
}
```

2. Register in the conversion service:
```typescript
conversionService.registerConverter(new MyConverter());
```

### Testing

```bash
# Run backend tests
cd backend && npm test

# Run frontend tests  
cd frontend && npm test
```

## 🐛 Troubleshooting

### Common Issues

**"VTracer not found"**
- Install VTracer: `cargo install vtracer`
- Or download binary from GitHub releases
- Ensure it's in your system PATH

**"OpenCV not available"**
- Install Python: `pip3 install opencv-python numpy`
- Check Python version: `python3 --version`

**"Port already in use"**
- Backend (3001): Change `PORT` in backend/.env
- Frontend (3000): Change port in frontend/package.json

**Large file uploads failing**
- Increase limits in backend/src/index.ts
- Check available disk space in uploads/

### Getting Help

1. Check the [documentation](docs/)
2. Search existing [issues](../../issues)
3. Create a new issue with:
   - OS and version
   - Node.js version
   - Error messages
   - Steps to reproduce

## 📈 Roadmap

### Version 1.1 (Next Release)
- [ ] Potrace integration
- [ ] Inkscape command-line support
- [ ] PDF/EPS export options
- [ ] Result preview with zoom/pan

### Version 1.2 (Future)
- [ ] Batch operation UI
- [ ] Custom parameter presets
- [ ] Cloud processing option
- [ ] API key management

### Version 2.0 (Long Term)
- [ ] Electron desktop app
- [ ] Advanced AI-based methods
- [ ] Plugin system
- [ ] Performance optimizations

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Guidelines
- Use TypeScript for all new code
- Follow existing code style
- Add tests for new features
- Update documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [VTracer](https://github.com/visioncortex/vtracer) - Modern vectorization
- [OpenCV](https://opencv.org/) - Computer vision library
- [Next.js](https://nextjs.org/) - React framework
- [Express.js](https://expressjs.com/) - Web framework

---

**Made with ❤️ for the design and development community**