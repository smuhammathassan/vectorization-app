'use client';

import { useState } from 'react';
import UploadZone from '@/components/UploadZone';
import ConversionPanel from '@/components/ConversionPanel';
import { Image as ImageIcon, Zap, Target, Layers } from 'lucide-react';

export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  const handleFilesUploaded = (files: any[]) => {
    setUploadedFiles(prev => [...prev, ...files]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                  <ImageIcon className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-gray-900">
                  Vector Converter
                </h1>
              </div>
            </div>
            <div className="text-sm text-gray-800">
              Raster to Vector Conversion
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">
              Professional Raster-to-Vector Conversion
            </h1>
            <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
              Transform your raster images into high-quality vector graphics using cutting-edge algorithms. 
              Support for multiple conversion methods with customizable parameters.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="text-center">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">Multiple Algorithms</h3>
                <p className="text-blue-100 text-sm">
                  VTracer, OpenCV, Potrace, and more conversion methods
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Target className="w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">High Quality</h3>
                <p className="text-blue-100 text-sm">
                  Professional-grade results with customizable parameters
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">Batch Processing</h3>
                <p className="text-blue-100 text-sm">
                  Convert multiple files with different methods simultaneously
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div>
            <div className="bg-white p-6 rounded-lg border shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Upload Images</h2>
              <UploadZone onFilesUploaded={handleFilesUploaded} />
            </div>

            {/* File Statistics */}
            {uploadedFiles.length > 0 && (
              <div className="mt-6 bg-white p-6 rounded-lg border shadow-sm">
                <h3 className="text-lg font-medium mb-3">Upload Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {uploadedFiles.length}
                    </div>
                    <div className="text-sm text-gray-800">Files Uploaded</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) > 1024 * 1024 
                        ? `${(uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) / (1024 * 1024)).toFixed(1)}MB`
                        : `${(uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) / 1024).toFixed(0)}KB`
                      }
                    </div>
                    <div className="text-sm text-gray-800">Total Size</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Conversion Section */}
          <div>
            <ConversionPanel uploadedFiles={uploadedFiles} />
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-center mb-8">Supported Conversion Methods</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg border shadow-sm">
              <h3 className="text-lg font-semibold mb-3 text-blue-600">VTracer</h3>
              <p className="text-gray-800 mb-3">
                Modern full-color vectorization with advanced clustering algorithms. 
                Perfect for complex images with multiple colors.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">High Quality</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Color Support</span>
                <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">Spline Curves</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border shadow-sm">
              <h3 className="text-lg font-semibold mb-3 text-green-600">OpenCV</h3>
              <p className="text-gray-800 mb-3">
                Contour-based vectorization with scientific precision. 
                Ideal for line art, logos, and technical drawings.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Fast Processing</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Precise Contours</span>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">Customizable</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-gray-800 text-sm">
            <p>&copy; 2024 Vector Converter. Professional raster-to-vector conversion tool.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
