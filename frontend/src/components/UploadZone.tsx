'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileImage, AlertCircle } from 'lucide-react';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  status: 'uploading' | 'uploaded' | 'error';
  progress: number;
  error?: string;
  uploadedData?: any;
}

interface UploadZoneProps {
  onFilesUploaded: (files: any[]) => void;
  maxFiles?: number;
  maxSize?: number;
}

const ACCEPTED_FORMATS = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
  'image/webp': ['.webp']
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function UploadZone({ 
  onFilesUploaded, 
  maxFiles = 10, 
  maxSize = MAX_FILE_SIZE 
}: UploadZoneProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Create initial file objects
    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      status: 'uploading',
      progress: 0
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
    setIsUploading(true);

    // Upload files
    const uploadPromises = newFiles.map(async (fileObj) => {
      try {
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setUploadedFiles(prev => 
            prev.map(f => 
              f.id === fileObj.id 
                ? { ...f, progress: Math.min(f.progress + 20, 80) }
                : f
            )
          );
        }, 200);

        const result = await uploadFile(fileObj.file);

        clearInterval(progressInterval);

        setUploadedFiles(prev => 
          prev.map(f => 
            f.id === fileObj.id 
              ? { ...f, status: 'uploaded', progress: 100, uploadedData: result.data }
              : f
          )
        );

        return result.data;
      } catch (error) {
        setUploadedFiles(prev => 
          prev.map(f => 
            f.id === fileObj.id 
              ? { 
                  ...f, 
                  status: 'error', 
                  progress: 0, 
                  error: error instanceof Error ? error.message : 'Upload failed'
                }
              : f
          )
        );
        return null;
      }
    });

    try {
      const results = await Promise.all(uploadPromises);
      const successfulUploads = results.filter(Boolean);
      
      if (successfulUploads.length > 0) {
        onFilesUploaded(successfulUploads);
      }
    } finally {
      setIsUploading(false);
    }
  }, [onFilesUploaded]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_FORMATS,
    maxSize,
    maxFiles,
    multiple: true
  });

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => {
      const fileToRemove = prev.find(f => f.id === fileId);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full">
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
          ${isDragActive 
            ? 'border-blue-500 bg-blue-50 text-blue-700' 
            : 'border-gray-300 hover:border-gray-400 text-gray-800'
          }
          ${isUploading ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 mb-4 text-gray-400" />
        <p className="text-lg font-medium mb-2">
          {isDragActive ? 'Drop files here...' : 'Drop files here or click to browse'}
        </p>
        <p className="text-sm text-gray-800 mb-4">
          Support for PNG, JPG, BMP, TIFF, WEBP up to {formatFileSize(maxSize)}
        </p>
        <p className="text-xs text-gray-700">
          Maximum {maxFiles} files at once
        </p>
      </div>

      {/* File Rejections */}
      {fileRejections.length > 0 && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-red-800">Some files were rejected:</h4>
              <ul className="mt-2 text-sm text-red-700">
                {fileRejections.map(({ file, errors }) => (
                  <li key={file.name} className="mt-1">
                    <span className="font-medium">{file.name}:</span>
                    <ul className="ml-4">
                      {errors.map(error => (
                        <li key={error.code}>• {error.message}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-4">Uploaded Files</h3>
          <div className="space-y-3">
            {uploadedFiles.map((fileObj) => (
              <div
                key={fileObj.id}
                className="flex items-center p-4 bg-white border rounded-lg shadow-sm"
              >
                {/* File Preview */}
                <div className="flex-shrink-0 mr-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                    {fileObj.preview ? (
                      <img
                        src={fileObj.preview}
                        alt={fileObj.file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FileImage className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {fileObj.file.name}
                  </p>
                  <p className="text-sm text-gray-800">
                    {formatFileSize(fileObj.file.size)}
                    {fileObj.uploadedData && (
                      <span className="ml-2">
                        • {fileObj.uploadedData.metadata?.width}×{fileObj.uploadedData.metadata?.height}
                      </span>
                    )}
                  </p>
                  
                  {/* Status */}
                  <div className="mt-2">
                    {fileObj.status === 'uploading' && (
                      <div className="flex items-center">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 mr-3">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${fileObj.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-700">{fileObj.progress}%</span>
                      </div>
                    )}
                    
                    {fileObj.status === 'uploaded' && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                        ✓ Uploaded
                      </span>
                    )}
                    
                    {fileObj.status === 'error' && (
                      <div>
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                          ✗ Error
                        </span>
                        {fileObj.error && (
                          <p className="text-xs text-red-600 mt-1">{fileObj.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => removeFile(fileObj.id)}
                  className="flex-shrink-0 ml-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                  disabled={fileObj.status === 'uploading'}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}