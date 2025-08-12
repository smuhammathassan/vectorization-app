import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

import { 
  FileUpload, 
  ConversionParams, 
  ConversionResult,
  ParameterDefinition,
  PerformanceInfo,
  QualityMetrics
} from '../../../shared/types';
import { IConverter } from './IConverter';
import { generateId } from '../../../shared/utils';
const stat = promisify(fs.stat);

export class VTracerConverter implements IConverter {
  name = 'vtracer';
  description = 'VTracer - High-quality full-color vectorization with advanced clustering algorithms';
  category: 'modern' = 'modern';
  supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'];
  requirements = ['vtracer binary'];

  parameters: ParameterDefinition[] = [
    {
      name: 'colorPrecision',
      type: 'number',
      label: 'Color Precision',
      description: 'Color precision (1-8, higher = more colors)',
      default: 6,
      min: 1,
      max: 8,
      step: 1
    },
    {
      name: 'layerDifference',
      type: 'number',
      label: 'Layer Difference',
      description: 'Layer difference threshold (0-255)',
      default: 16,
      min: 0,
      max: 255,
      step: 1
    },
    {
      name: 'mode',
      type: 'select',
      label: 'Curve Mode',
      description: 'Curve fitting mode',
      default: 'spline',
      options: [
        { value: 'spline', label: 'Spline (smooth curves)' },
        { value: 'polygon', label: 'Polygon (straight lines)' },
        { value: 'none', label: 'None (pixel perfect)' }
      ]
    },
    {
      name: 'filterSpeckle',
      type: 'number',
      label: 'Filter Speckle',
      description: 'Filter speckle areas smaller than this (pixels)',
      default: 4,
      min: 0,
      max: 100,
      step: 1
    },
    {
      name: 'cornerThreshold',
      type: 'number',
      label: 'Corner Threshold',
      description: 'Corner detection threshold (0-180 degrees)',
      default: 60,
      min: 0,
      max: 180,
      step: 1
    },
    {
      name: 'lengthThreshold',
      type: 'number',
      label: 'Length Threshold',
      description: 'Minimum path length',
      default: 4.0,
      min: 0.1,
      max: 100.0,
      step: 0.1
    },
    {
      name: 'colorSpace',
      type: 'select',
      label: 'Color Space',
      description: 'Output color space for the vectorized result',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto (recommended based on image)' },
        { value: 'rgb', label: 'RGB (digital/screen use)' },
        { value: 'cmyk', label: 'CMYK (print use)' },
        { value: 'grayscale', label: 'Grayscale (monochrome)' }
      ]
    }
  ];

  performance: PerformanceInfo = {
    speed: 'medium',
    quality: 'excellent',
    memoryUsage: 'medium',
    bestFor: ['logos', 'illustrations', 'graphics', 'full-color images']
  };

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync('vtracer --version', { timeout: 5000 });
      return stdout.includes('vtracer') || stderr.includes('vtracer') || stdout.trim().length > 0;
    } catch {
      try {
        // Try alternative paths
        const { stdout, stderr } = await execAsync('./vtracer --version', { timeout: 5000 });
        return stdout.includes('vtracer') || stderr.includes('vtracer') || stdout.trim().length > 0;
      } catch (error) {
        console.log('VTracer not available:', error instanceof Error ? error.message : 'Binary not found');
        return false;
      }
    }
  }

  async validateParameters(params: ConversionParams): Promise<string[]> {
    const errors: string[] = [];

    if (params.colorPrecision !== undefined) {
      if (params.colorPrecision < 1 || params.colorPrecision > 8) {
        errors.push('Color precision must be between 1 and 8');
      }
    }

    if (params.layerDifference !== undefined) {
      if (params.layerDifference < 0 || params.layerDifference > 255) {
        errors.push('Layer difference must be between 0 and 255');
      }
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

    if (params.cornerThreshold !== undefined) {
      if (params.cornerThreshold < 0 || params.cornerThreshold > 180) {
        errors.push('Corner threshold must be between 0 and 180');
      }
    }

    if (params.lengthThreshold !== undefined && params.lengthThreshold <= 0) {
      errors.push('Length threshold must be positive');
    }

    if (params.colorSpace !== undefined) {
      const validColorSpaces = ['rgb', 'cmyk', 'grayscale', 'auto'];
      if (!validColorSpaces.includes(params.colorSpace)) {
        errors.push('Color space must be one of: rgb, cmyk, grayscale, auto');
      }
    }

    return errors;
  }

  async convert(
    file: FileUpload, 
    params: ConversionParams, 
    onProgress?: (progress: number) => void
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    
    try {
      if (onProgress) onProgress(10);

      // Generate output filename
      const outputId = generateId();
      const outputPath = path.resolve(__dirname, '../../outputs', `${outputId}.svg`);

      // Build vtracer command
      const args = [
        '--input', `"${file.path}"`,
        '--output', `"${outputPath}"`
      ];

      // Add parameters
      if (params.colorPrecision !== undefined) {
        args.push('--colorprecision', params.colorPrecision.toString());
      }
      
      if (params.layerDifference !== undefined) {
        args.push('--layerdiff', params.layerDifference.toString());
      }

      if (params.mode !== undefined) {
        args.push('--mode', params.mode);
      }

      if (params.filterSpeckle !== undefined) {
        args.push('--filter-speckle', params.filterSpeckle.toString());
      }

      if (params.cornerThreshold !== undefined) {
        args.push('--corner-threshold', params.cornerThreshold.toString());
      }

      if (params.lengthThreshold !== undefined) {
        args.push('--length-threshold', params.lengthThreshold.toString());
      }

      const command = `vtracer ${args.join(' ')}`;
      
      if (onProgress) onProgress(30);

      console.log('Executing VTracer command:', command);
      
      // Execute conversion
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000 // 5 minutes timeout
      });

      if (onProgress) onProgress(80);

      // Check if output file was created
      try {
        const outputStats = await stat(outputPath);
        
        if (onProgress) onProgress(95);

        // Calculate quality metrics
        const processingTime = Date.now() - startTime;
        const qualityMetrics = await this.calculateQualityMetrics(
          outputPath, 
          file, 
          processingTime,
          params
        );

        if (onProgress) onProgress(100);

        return {
          success: true,
          outputPath,
          qualityMetrics
        };

      } catch (statError) {
        throw new Error('Output file was not created');
      }

    } catch (error) {
      console.error('VTracer conversion error:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'VTracer conversion failed'
      };
    }
  }

  estimateTime(fileSize: number, params: ConversionParams): number {
    // Base time: ~2ms per KB
    let baseTime = Math.max(2000, fileSize / 512);
    
    // Adjust for parameters
    if (params.colorPrecision && params.colorPrecision > 6) {
      baseTime *= 1.5;
    }
    
    if (params.mode === 'spline') {
      baseTime *= 1.3;
    } else if (params.mode === 'none') {
      baseTime *= 0.8;
    }

    return Math.round(baseTime);
  }

  private async calculateQualityMetrics(
    outputPath: string, 
    inputFile: FileUpload, 
    processingTime: number,
    params: ConversionParams
  ): Promise<QualityMetrics> {
    try {
      const outputStats = await stat(outputPath);
      const outputContent = await fs.promises.readFile(outputPath, 'utf8');
      
      // Count SVG paths and points (rough estimates)
      const pathMatches = outputContent.match(/<path/g);
      const pathCount = pathMatches ? pathMatches.length : 0;
      
      // Estimate point count from path data
      const pathDataMatches = outputContent.match(/[ML]\s*[\d.-]+\s*[\d.-]+/g);
      const pointCount = pathDataMatches ? pathDataMatches.length : 0;

      return {
        pathCount,
        pointCount,
        fileSize: outputStats.size,
        processingTime,
        accuracy: this.estimateAccuracy(pathCount, inputFile.metadata?.width, inputFile.metadata?.height),
        smoothness: params.mode === 'spline' ? 0.9 : 0.7
      };
    } catch (error) {
      console.warn('Failed to calculate quality metrics:', error);
      return {
        pathCount: 0,
        pointCount: 0,
        fileSize: 0,
        processingTime
      };
    }
  }

  private estimateAccuracy(pathCount: number, width?: number, height?: number): number {
    if (!width || !height) return 0.8;
    
    const totalPixels = width * height;
    const pathDensity = pathCount / (totalPixels / 1000); // paths per 1000 pixels
    
    // Higher path density generally means better accuracy, but with diminishing returns
    return Math.min(0.95, 0.6 + Math.log10(pathDensity + 1) * 0.2);
  }
}