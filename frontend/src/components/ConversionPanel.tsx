'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, 
  Play, 
  Download, 
  Eye, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Upload 
} from 'lucide-react';

interface ConversionMethod {
  name: string;
  description: string;
  category: string;
  supportedFormats: string[];
  parameters: {
    name: string;
    type: string;
    label: string;
    description: string;
    default: any;
    min?: number;
    max?: number;
    step?: number;
    options?: { value: any; label: string }[];
  }[];
  performance: {
    speed: string;
    quality: string;
    memoryUsage: string;
    bestFor: string[];
  };
  available: boolean;
  requirements?: string[];
}

interface ConversionJob {
  id: string;
  fileId?: string;
  method: string;
  status: string;
  progress: number;
  createdAt: string;
  error?: string;
  estimatedTime?: number;
}

interface ConversionPanelProps {
  uploadedFiles: any[];
}

export default function ConversionPanel({ uploadedFiles }: ConversionPanelProps) {
  const [methods, setMethods] = useState<ConversionMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Effect 1: Fetch methods on component mount
  useEffect(() => {
    fetchMethods();
  }, []);

  // Effect 2: Debug state changes
  useEffect(() => {
    console.log('selectedMethod state changed to:', selectedMethod);
  }, [selectedMethod]);

  // Effect 3: Auto-select first available method when methods load
  useEffect(() => {
    if (methods.length > 0 && !selectedMethod) {
      const firstAvailable = methods.find(m => m.available);
      const autoSelect = firstAvailable ? firstAvailable.name : methods[0].name;
      console.log('Auto-selecting method due to empty selection:', autoSelect);
      setSelectedMethod(autoSelect);
    }
  }, [methods.length, selectedMethod]);

  const fetchMethods = async () => {
    try {
      const response = await fetch('/api/methods');
      const data = await response.json();
      if (data.success) {
        console.log('Methods loaded:', data.data);
        setMethods(data.data || []);
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('Failed to fetch methods:', error);
    } finally {
      setLoading(false);
    }
  };

  const startConversion = async (fileId: string) => {
    // Always use effectiveSelectedMethod which has fallback logic
    const methodToUse = effectiveSelectedMethod;
    
    console.log('=== CONVERSION ATTEMPT ===');
    console.log('selectedMethod:', selectedMethod);
    console.log('effectiveSelectedMethod:', effectiveSelectedMethod);
    console.log('methodToUse:', methodToUse);
    console.log('methods available:', methods.map(m => m.name));
    
    if (!methodToUse || methodToUse === '' || !methods.length) {
      console.error('NO METHOD AVAILABLE - either no methods loaded or selection failed');
      alert(`No conversion method available. Methods loaded: ${methods.length}, Effective method: "${effectiveSelectedMethod}"`);
      return;
    }

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId,
          method: methodToUse,
          parameters
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        const newJob = data.data;
        setJobs(prev => [...prev, newJob]);
        
        // Start polling for job status
        pollJobStatus(newJob.id);
      } else {
        alert('Failed to start conversion: ' + data.error);
      }
    } catch (error) {
      console.error('Conversion error:', error);
      alert('Failed to start conversion');
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/convert/${jobId}/status`);
        const data = await response.json();
        
        if (data.success) {
          const updatedJob = data.data;
          setJobs(prev => 
            prev.map(job => 
              job.id === jobId ? { ...job, ...updatedJob } : job
            )
          );

          // Stop polling if job is completed or failed
          if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Failed to poll job status:', error);
        clearInterval(pollInterval);
      }
    }, 1000);
  };

  const downloadResult = async (jobId: string) => {
    try {
      const response = await fetch(`/api/convert/${jobId}/result`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `converted_${jobId}.svg`;
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'processing':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-900">Loading conversion methods...</span>
      </div>
    );
  }

  if (uploadedFiles.length === 0) {
    return (
      <div className="text-center py-12 text-gray-800">
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p>Upload files to start converting</p>
      </div>
    );
  }

  // Ensure we always have a selection when methods are available but selectedMethod is empty
  const effectiveSelectedMethod = selectedMethod || (methods.length > 0 ? methods.find(m => m.available)?.name || methods[0]?.name : '');
  const selectedMethodObj = methods.find(m => m.name === effectiveSelectedMethod);
  

  return (
    <div className="space-y-6">
      {/* Method Selection */}
      <div className="bg-white p-6 rounded-lg border shadow-sm">
        <h3 className="text-lg font-medium mb-4">Conversion Method</h3>
        
        <div className="mb-6">
          <label htmlFor="method-select" className="block text-sm font-medium text-gray-900 mb-2">
            Select Conversion Method
          </label>
          <div className="text-xs text-blue-600 mb-1 font-mono">
            DEBUG: Current selection: "{selectedMethod}" (type: {typeof selectedMethod})
          </div>
          <div className="text-xs text-green-600 mb-1">
            Available methods: {methods.map(m => m.name).join(', ')}
          </div>
          <div className="flex gap-2 mb-2">
            {methods.slice(0, 2).map(method => (
              <button
                key={method.name}
                onClick={() => {
                  console.log('Manual selection:', method.name);
                  setSelectedMethod(method.name);
                }}
                className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
              >
                Select {method.name}
              </button>
            ))}
          </div>
          <select
            id="method-select"
            value={effectiveSelectedMethod}
            onChange={(e) => {
              console.log('Dropdown changed to:', e.target.value);
              const newMethod = e.target.value;
              setSelectedMethod(newMethod);
              // Force a re-render by setting parameters to ensure UI updates
              setParameters(prev => ({ ...prev }));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="" disabled>Choose a conversion method...</option>
            {methods.map((method, index) => (
              <option
                key={`method-${method.name}-${index}`}
                value={method.name}
                disabled={!method.available}
              >
                {method.name.toUpperCase()} - {method.performance.quality} quality, {method.performance.speed} speed {!method.available ? '(Unavailable)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Selected Method Details */}
        {selectedMethodObj && (
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-medium text-gray-900 text-lg">{selectedMethodObj.name}</h4>
                <p className="text-sm text-gray-800 mt-1">{selectedMethodObj.description}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                selectedMethodObj.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {selectedMethodObj.available ? 'Available' : 'Unavailable'}
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="text-center">
                <span className="block text-xs text-gray-700">Speed</span>
                <span className="text-sm font-medium capitalize">{selectedMethodObj.performance.speed}</span>
              </div>
              <div className="text-center">
                <span className="block text-xs text-gray-700">Quality</span>
                <span className="text-sm font-medium capitalize">{selectedMethodObj.performance.quality}</span>
              </div>
              <div className="text-center">
                <span className="block text-xs text-gray-700">Memory</span>
                <span className="text-sm font-medium capitalize">{selectedMethodObj.performance.memoryUsage}</span>
              </div>
              <div className="text-center">
                <span className="block text-xs text-gray-700">Category</span>
                <span className="text-sm font-medium capitalize">{selectedMethodObj.category}</span>
              </div>
            </div>
            
            {selectedMethodObj.performance.bestFor.length > 0 && (
              <div>
                <span className="text-xs text-gray-700">Best for: </span>
                <span className="text-xs text-gray-700">{selectedMethodObj.performance.bestFor.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        {/* Parameters */}
        {selectedMethodObj && selectedMethodObj.parameters.length > 0 && (
          <div className="border-t pt-4">
            <div className="flex items-center mb-3">
              <Settings className="w-5 h-5 text-gray-700 mr-2" />
              <h4 className="font-medium text-gray-900">Parameters</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedMethodObj.parameters.map((param) => (
                <div key={param.name}>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    {param.label}
                  </label>
                  
                  {param.type === 'number' && (
                    <input
                      type="number"
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      value={parameters[param.name] || param.default}
                      onChange={(e) => setParameters(prev => ({
                        ...prev,
                        [param.name]: parseFloat(e.target.value) || param.default
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  
                  {param.type === 'select' && (
                    <select
                      value={parameters[param.name] || param.default}
                      onChange={(e) => setParameters(prev => ({
                        ...prev,
                        [param.name]: e.target.value
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                      {param.options?.map((option, index) => (
                        <option key={`${param.name}-${option.value}-${index}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                  
                  {param.type === 'boolean' && (
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={parameters[param.name] !== undefined ? parameters[param.name] : param.default}
                        onChange={(e) => setParameters(prev => ({
                          ...prev,
                          [param.name]: e.target.checked
                        }))}
                        className="mr-2 focus:ring-blue-500 text-blue-600"
                      />
                      <span className="text-sm text-gray-900">Enable</span>
                    </label>
                  )}
                  
                  <p className="text-xs text-gray-700 mt-1">{param.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* File Conversion List */}
      <div className="bg-white p-6 rounded-lg border shadow-sm">
        <h3 className="text-lg font-medium mb-4">Convert Files</h3>
        
        <div className="space-y-3">
          {uploadedFiles.map((file) => {
            const fileJobs = jobs.filter(job => job.fileId === file.id);
            
            return (
              <div key={file.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg mr-3 flex items-center justify-center overflow-hidden">
                      <img
                        src={`/api/files/${file.id}/thumbnail`}
                        alt={file.originalName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <Eye className="w-5 h-5 text-gray-400 hidden" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{file.originalName}</p>
                      <p className="text-sm text-gray-800">
                        {file.metadata?.width}×{file.metadata?.height}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => startConversion(file.id)}
                    disabled={!effectiveSelectedMethod || !selectedMethodObj?.available || fileJobs.some(job => job.status === 'processing')}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Convert
                  </button>
                </div>
                
                {/* Job Status */}
                {fileJobs.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="space-y-2">
                      {fileJobs.map((job) => (
                        <div key={job.id} className="flex items-center justify-between">
                          <div className="flex items-center">
                            {getStatusIcon(job.status)}
                            <span className="ml-2 text-sm text-gray-900">
                              {methods.find(m => m.name === job.method)?.name || job.method}
                            </span>
                            <span className={`ml-2 px-2 py-1 text-xs rounded ${getStatusColor(job.status)}`}>
                              {job.status}
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            {job.status === 'processing' && (
                              <div className="flex items-center">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${job.progress}%` }}
                                  />
                                </div>
                                <span className="ml-2 text-xs text-gray-700">{job.progress}%</span>
                              </div>
                            )}
                            
                            {job.estimatedTime && job.status !== 'completed' && (
                              <span className="text-xs text-gray-700">
                                ~{formatDuration(job.estimatedTime)}
                              </span>
                            )}
                            
                            {job.status === 'completed' && (
                              <button
                                onClick={() => downloadResult(job.id)}
                                className="flex items-center px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Download
                              </button>
                            )}
                            
                            {job.error && (
                              <span className="text-xs text-red-600" title={job.error}>
                                Error
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}