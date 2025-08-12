export interface ConversionJob {
  id: string;
  fileId: string;
  method: string;
  status: JobStatus;
  progress: number;
  parameters: ConversionParams;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  estimatedTime?: number;
  resultPath?: string;
  qualityMetrics?: QualityMetrics;
}

export interface ConversionParams {
  // Common parameters
  colorMode?: 'binary' | 'color' | 'grayscale';
  outputFormat?: 'svg' | 'pdf' | 'eps' | 'ai';
  
  // VTracer specific
  colorPrecision?: number;
  layerDifference?: number;
  mode?: 'spline' | 'polygon' | 'none';
  filterSpeckle?: number;
  cornerThreshold?: number;
  lengthThreshold?: number;
  
  // Potrace specific
  threshold?: number;
  turnPolicy?: string;
  turdSize?: number;
  alphaMax?: number;
  longCoding?: boolean;
  opttolerance?: number;
  
  // OpenCV specific
  contourMode?: number;
  contourMethod?: number;
  epsilon?: number;
  minArea?: number;
  
  // Inkscape specific
  inkscapeMode?: string;
  colors?: number;
  stack?: boolean;
  removeBackground?: boolean;
  multipleScans?: number;
  
  // General preprocessing
  despeckle?: boolean;
  smooth?: boolean;
  autoCrop?: boolean;
  backgroundColor?: string;
}

export interface QualityMetrics {
  pathCount: number;
  pointCount: number;
  fileSize: number;
  processingTime: number;
  accuracy?: number;
  smoothness?: number;
}

export interface FileUpload {
  id: string;
  originalName: string;
  filename: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
  path: string;
  metadata?: ImageMetadata;
}

export interface ImageMetadata {
  width: number;
  height: number;
  channels: number;
  colorSpace: string;
  hasAlpha: boolean;
  density?: number;
}

export interface ConversionMethod {
  id: string;
  name: string;
  description: string;
  category: 'traditional' | 'modern' | 'ai' | 'external';
  supportedFormats: string[];
  parameters: ParameterDefinition[];
  performance: PerformanceInfo;
  available: boolean;
  requirements?: string[];
}

export interface ParameterDefinition {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  label: string;
  description: string;
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: any; label: string }[];
  required?: boolean;
}

export interface PerformanceInfo {
  speed: 'fast' | 'medium' | 'slow';
  quality: 'basic' | 'good' | 'excellent';
  memoryUsage: 'low' | 'medium' | 'high';
  bestFor: string[];
}

export interface ConversionResult {
  success: boolean;
  outputPath?: string;
  outputData?: Buffer;
  qualityMetrics?: QualityMetrics;
  error?: string;
  warnings?: string[];
}

export type JobStatus = 
  | 'pending'
  | 'queued' 
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface BatchConversionRequest {
  fileIds: string[];
  methods: string[];
  parameters: ConversionParams;
}

export interface BatchConversionJob {
  id: string;
  jobs: ConversionJob[];
  status: JobStatus;
  progress: number;
  createdAt: Date;
  completedJobs: number;
  totalJobs: number;
}