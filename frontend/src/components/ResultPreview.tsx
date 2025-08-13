'use client';

import { useState, useEffect } from 'react';
import { 
  Download, 
  Eye, 
  EyeOff, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Maximize2,
  X,
  FileText,
  Image as ImageIcon
} from 'lucide-react';

interface ResultPreviewProps {
  jobId: string;
  originalFileId: string;
  originalFileName: string;
  method: string;
  onClose: () => void;
}

export default function ResultPreview({ 
  jobId, 
  originalFileId, 
  originalFileName, 
  method, 
  onClose 
}: ResultPreviewProps) {
  const [zoom, setZoom] = useState(1);
  const [showOriginal, setShowOriginal] = useState(true);
  const [showConverted, setShowConverted] = useState(true);
  const [resultStats, setResultStats] = useState<{
    fileSize: number;
    dimensions?: { width: number; height: number };
    paths?: number;
  } | null>(null);

  useEffect(() => {
    // Fetch result statistics
    fetchResultStats();
  }, [jobId]);

  const fetchResultStats = async () => {
    try {
      const response = await fetch(`/api/convert/${jobId}/stats`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setResultStats(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch result stats:', error);
    }
  };

  const downloadResult = async () => {
    try {
      const response = await fetch(`/api/convert/${jobId}/result`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `converted_${originalFileName.replace(/\.[^/.]+$/, '')}_${method}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('Failed to download result');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download result');
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.2, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.1));
  const handleResetZoom = () => setZoom(1);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-7xl w-full h-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-4">
            <div>
              <h2 className="text-lg font-semibold">{originalFileName}</h2>
              <p className="text-sm text-gray-600">Converted with {method}</p>
            </div>
            
            {resultStats && (
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <FileText className="w-4 h-4" />
                  <span>{formatFileSize(resultStats.fileSize)}</span>
                </div>
                {resultStats.dimensions && (
                  <div className="flex items-center space-x-1">
                    <ImageIcon className="w-4 h-4" />
                    <span>{resultStats.dimensions.width} × {resultStats.dimensions.height}</span>
                  </div>
                )}
                {resultStats.paths && (
                  <div className="flex items-center space-x-1">
                    <span>{resultStats.paths} paths</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={downloadResult}
              className="flex items-center px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
            >
              <Download className="w-4 h-4 mr-1" />
              Download SVG
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                className={`flex items-center px-3 py-1.5 rounded text-sm ${
                  showOriginal 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {showOriginal ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
                Original
              </button>
              <button
                onClick={() => setShowConverted(!showConverted)}
                className={`flex items-center px-3 py-1.5 rounded text-sm ${
                  showConverted 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {showConverted ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
                Converted
              </button>
            </div>

            <div className="h-6 border-l border-gray-300"></div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleZoomOut}
                className="p-1.5 text-gray-600 hover:text-gray-800 rounded"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 text-gray-600 hover:text-gray-800 rounded"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-1.5 text-gray-600 hover:text-gray-800 rounded"
                title="Reset Zoom"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button className="flex items-center px-3 py-1.5 text-gray-600 hover:text-gray-800 rounded text-sm">
            <Maximize2 className="w-4 h-4 mr-1" />
            Fullscreen
          </button>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex">
            {/* Original Image */}
            {showOriginal && (
              <div className="flex-1 border-r border-gray-200 bg-gray-50 overflow-auto">
                <div className="p-4">
                  <div className="text-center mb-2">
                    <h3 className="text-sm font-medium text-gray-700">Original</h3>
                  </div>
                  <div 
                    className="flex items-center justify-center min-h-[400px]"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <img
                      src={`/api/files/${originalFileId}/preview`}
                      alt="Original"
                      className="max-w-full max-h-full object-contain shadow-lg rounded"
                      style={{ imageRendering: zoom > 2 ? 'pixelated' : 'auto' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Converted SVG */}
            {showConverted && (
              <div className="flex-1 bg-white overflow-auto">
                <div className="p-4">
                  <div className="text-center mb-2">
                    <h3 className="text-sm font-medium text-gray-700">Converted (SVG)</h3>
                  </div>
                  <div 
                    className="flex items-center justify-center min-h-[400px]"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <object
                      data={`/api/convert/${jobId}/result`}
                      type="image/svg+xml"
                      className="max-w-full max-h-full shadow-lg rounded"
                      style={{ width: '100%', height: '400px' }}
                    >
                      <div className="flex items-center justify-center h-[400px] text-gray-500">
                        <div className="text-center">
                          <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                          <p>Unable to preview SVG</p>
                          <button
                            onClick={downloadResult}
                            className="mt-2 text-blue-600 hover:text-blue-700 text-sm underline"
                          >
                            Download to view
                          </button>
                        </div>
                      </div>
                    </object>
                  </div>
                </div>
              </div>
            )}

            {/* Show message when both are hidden */}
            {!showOriginal && !showConverted && (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <EyeOff className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>Toggle the visibility controls to view images</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Stats */}
        <div className="border-t bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center space-x-6">
              <span>Conversion Method: <strong>{method}</strong></span>
              {resultStats && (
                <>
                  <span>File Size: <strong>{formatFileSize(resultStats.fileSize)}</strong></span>
                  {resultStats.paths && (
                    <span>Vector Paths: <strong>{resultStats.paths}</strong></span>
                  )}
                </>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Use mouse wheel to zoom • Drag to pan
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}