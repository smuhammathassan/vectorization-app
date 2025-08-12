export const SUPPORTED_INPUT_FORMATS = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/bmp',
  'image/tiff',
  'image/webp'
] as const;

export const SUPPORTED_OUTPUT_FORMATS = [
  'svg',
  'pdf',
  'eps',
  'ai'
] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILES_PER_BATCH = 10;

export const CONVERSION_METHODS = {
  VTRACER: 'vtracer',
  OPENCV: 'opencv',
  POTRACE: 'potrace',
  AUTOTRACE: 'autotrace',
  INKSCAPE: 'inkscape',
  SKIMAGE: 'skimage'
} as const;

export const JOB_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
} as const;

export const API_ENDPOINTS = {
  // File management
  UPLOAD: '/api/upload',
  FILES: '/api/files',
  
  // Conversion
  CONVERT: '/api/convert',
  BATCH_CONVERT: '/api/convert/batch',
  
  // Methods
  METHODS: '/api/methods',
  
  // Health
  HEALTH: '/api/health'
} as const;

export const ERROR_CODES = {
  // File errors
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FORMAT: 'INVALID_FORMAT',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  
  // Conversion errors
  CONVERSION_FAILED: 'CONVERSION_FAILED',
  METHOD_NOT_AVAILABLE: 'METHOD_NOT_AVAILABLE',
  INVALID_PARAMETERS: 'INVALID_PARAMETERS',
  
  // System errors
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  DEPENDENCY_MISSING: 'DEPENDENCY_MISSING'
} as const;