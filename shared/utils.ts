import { SUPPORTED_INPUT_FORMATS } from './constants';

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function isValidImageFormat(mimetype: string): boolean {
  return SUPPORTED_INPUT_FORMATS.includes(mimetype as any);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function estimateProcessingTime(fileSize: number, method: string): number {
  // Rough estimates in milliseconds based on file size and method
  const baseTime = Math.max(1000, fileSize / 1024); // 1ms per KB minimum 1s
  
  const methodMultipliers = {
    vtracer: 1.5,
    opencv: 1.0,
    potrace: 0.8,
    autotrace: 1.2,
    inkscape: 2.0,
    skimage: 1.8
  };
  
  const multiplier = methodMultipliers[method as keyof typeof methodMultipliers] || 1.0;
  return Math.round(baseTime * multiplier);
}

export function validateConversionParams(params: any, method: string): string[] {
  const errors: string[] = [];
  
  // Add parameter validation logic based on method
  if (method === 'vtracer') {
    if (params.colorPrecision !== undefined && (params.colorPrecision < 1 || params.colorPrecision > 8)) {
      errors.push('Color precision must be between 1 and 8');
    }
    if (params.layerDifference !== undefined && (params.layerDifference < 0 || params.layerDifference > 255)) {
      errors.push('Layer difference must be between 0 and 255');
    }
    if (params.mode !== undefined) {
      const validModes = ['spline', 'polygon', 'none'];
      if (!validModes.includes(params.mode)) {
        errors.push(`Mode must be one of: ${validModes.join(', ')}`);
      }
    }
    if (params.filterSpeckle !== undefined && params.filterSpeckle < 0) {
      errors.push('Filter speckle must be non-negative');
    }
    if (params.cornerThreshold !== undefined && (params.cornerThreshold < 0 || params.cornerThreshold > 180)) {
      errors.push('Corner threshold must be between 0 and 180');
    }
    if (params.lengthThreshold !== undefined && params.lengthThreshold <= 0) {
      errors.push('Length threshold must be positive');
    }
  }
  
  if (method === 'opencv') {
    if (params.threshold !== undefined && (params.threshold < 0 || params.threshold > 255)) {
      errors.push('Threshold must be between 0 and 255');
    }
    if (params.epsilon !== undefined && params.epsilon <= 0) {
      errors.push('Epsilon must be positive');
    }
    if (params.minArea !== undefined && params.minArea < 1) {
      errors.push('Minimum area must be at least 1');
    }
    if (params.colorMode !== undefined) {
      const validModes = ['binary', 'grayscale', 'color'];
      if (!validModes.includes(params.colorMode)) {
        errors.push(`Color mode must be one of: ${validModes.join(', ')}`);
      }
    }
  }
  
  if (method === 'potrace') {
    if (params.threshold !== undefined && (params.threshold < 0 || params.threshold > 1)) {
      errors.push('Threshold must be between 0 and 1');
    }
    if (params.turdSize !== undefined && (params.turdSize < 0 || params.turdSize > 100)) {
      errors.push('Turd size must be between 0 and 100');
    }
    if (params.alphaMax !== undefined && (params.alphaMax < 0 || params.alphaMax > 1.334)) {
      errors.push('Alpha max must be between 0 and 1.334');
    }
    if (params.opttolerance !== undefined && (params.opttolerance < 0 || params.opttolerance > 2.0)) {
      errors.push('Optimization tolerance must be between 0 and 2.0');
    }
    if (params.turnPolicy !== undefined) {
      const validPolicies = ['black', 'white', 'left', 'right', 'minority', 'majority', 'random'];
      if (!validPolicies.includes(params.turnPolicy)) {
        errors.push(`Turn policy must be one of: ${validPolicies.join(', ')}`);
      }
    }
  }
  
  if (method === 'inkscape') {
    if (params.threshold !== undefined && (params.threshold < 0.0 || params.threshold > 1.0)) {
      errors.push('Threshold must be between 0.0 and 1.0');
    }
    if (params.colors !== undefined && (params.colors < 2 || params.colors > 32)) {
      errors.push('Colors must be between 2 and 32');
    }
    if (params.multipleScans !== undefined && (params.multipleScans < 1 || params.multipleScans > 32)) {
      errors.push('Multiple scans must be between 1 and 32');
    }
    if (params.inkscapeMode !== undefined) {
      const validModes = ['brightnessCutoff', 'edgeDetection', 'colorQuantization', 'autotrace', 'centerline'];
      if (!validModes.includes(params.inkscapeMode)) {
        errors.push(`Inkscape mode must be one of: ${validModes.join(', ')}`);
      }
    }
  }
  
  return errors;
}