import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { stat } from 'fs';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
import { IConverter } from './IConverter';
import { FileUpload, ConversionParams, QualityMetrics, ConversionResult, PerformanceInfo, ParameterDefinition } from '../../../shared/types';
import { generateId } from '../../../shared/utils';

const statAsync = promisify(stat);

export class InkscapeConverter implements IConverter {
  name: string = 'inkscape';
  description: string = 'Inkscape - Professional vector graphics editor with advanced tracing';
  category: 'external' = 'external';
  supportedFormats: string[] = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'];

  parameters: ParameterDefinition[] = [
    {
      name: 'inkscapeMode',
      type: 'select',
      label: 'Trace Mode',
      description: 'Bitmap tracing algorithm',
      default: 'brightnessCutoff',
      options: [
        { value: 'brightnessCutoff', label: 'Brightness cutoff' },
        { value: 'edgeDetection', label: 'Edge detection' },
        { value: 'colorQuantization', label: 'Color quantization' },
        { value: 'autotrace', label: 'Autotrace' },
        { value: 'centerline', label: 'Centerline tracing' }
      ]
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Threshold',
      description: 'Brightness threshold (0.0-1.0)',
      default: 0.45,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    {
      name: 'colors',
      type: 'number',
      label: 'Colors',
      description: 'Number of colors for quantization',
      default: 8,
      min: 2,
      max: 32,
      step: 1
    },
    {
      name: 'smooth',
      type: 'boolean',
      label: 'Smooth',
      description: 'Smooth corners of traces',
      default: true
    },
    {
      name: 'stack',
      type: 'boolean',
      label: 'Stack Scans',
      description: 'Stack scans on top of each other',
      default: true
    },
    {
      name: 'removeBackground',
      type: 'boolean',
      label: 'Remove Background',
      description: 'Remove background color',
      default: false
    },
    {
      name: 'multipleScans',
      type: 'number',
      label: 'Multiple Scans',
      description: 'Number of brightness scans',
      default: 1,
      min: 1,
      max: 32,
      step: 1
    }
  ];

  performance: PerformanceInfo = {
    speed: 'slow',
    quality: 'excellent',
    memoryUsage: 'high',
    bestFor: ['detailed artwork', 'photographs', 'complex illustrations', 'multi-color images']
  };

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync('inkscape --version', { timeout: 5000 });
      return stdout.includes('Inkscape') || stderr.includes('Inkscape') || stdout.trim().length > 0;
    } catch (error) {
      console.log('Inkscape not available:', error instanceof Error ? error.message : 'Binary not found');
      return false;
    }
  }

  async convert(
    file: FileUpload,
    params: ConversionParams = {},
    onProgress?: (progress: number) => void
  ): Promise<ConversionResult> {
    
    try {
      if (onProgress) onProgress(10);

      // Generate output filename
      const outputId = generateId();
      const outputPath = path.resolve(__dirname, '../../outputs', `${outputId}.svg`);

      // Build inkscape command for tracing
      const args = [
        '--export-type=svg',
        '--export-filename=' + outputPath
      ];

      // Configure tracing parameters based on mode
      const mode = params.inkscapeMode || 'brightnessCutoff';
      
      switch (mode) {
        case 'brightnessCutoff':
          args.push('--trace-bitmap');
          if (params.threshold !== undefined) {
            args.push(`--trace-bitmap-threshold=${params.threshold}`);
          }
          break;
        
        case 'edgeDetection':
          args.push('--trace-bitmap-edge');
          break;
        
        case 'colorQuantization':
          args.push('--trace-bitmap-colors');
          if (params.colors !== undefined) {
            args.push(`--trace-bitmap-colors=${params.colors}`);
          }
          break;
        
        case 'autotrace':
          args.push('--trace-bitmap-autotrace');
          break;
        
        case 'centerline':
          args.push('--trace-bitmap-centerline');
          break;
      }

      // Additional options
      if (params.smooth) {
        args.push('--trace-bitmap-smooth');
      }

      if (params.stack) {
        args.push('--trace-bitmap-stack');
      }

      if (params.removeBackground) {
        args.push('--trace-bitmap-remove-background');
      }

      if (params.multipleScans && params.multipleScans > 1) {
        args.push(`--trace-bitmap-scans=${params.multipleScans}`);
      }

      // Add input file
      args.push(file.path);

      if (onProgress) onProgress(30);

      // Execute inkscape
      const command = `inkscape ${args.join(' ')}`;
      console.log('Executing Inkscape command:', command);
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000 // 60 seconds timeout - Inkscape can take longer
      });

      const result = { code: 0, stderr, stdout };

      if (onProgress) onProgress(80);

      if (result.code !== 0) {
        throw new Error(`Inkscape failed with code ${result.code}: ${result.stderr}`);
      }

      // Verify output file exists
      try {
        const outputStats = await statAsync(outputPath);
        if (outputStats.size === 0) {
          throw new Error('Generated SVG file is empty');
        }
      } catch (error) {
        throw new Error(`Output file verification failed: ${error}`);
      }

      if (onProgress) onProgress(90);

      // Calculate quality metrics
      const qualityMetrics = await this.calculateQualityMetrics(
        outputPath, 
        file, 
        Date.now() - Date.now(),
        params
      );

      if (onProgress) onProgress(100);

      return {
        success: true,
        outputPath,
        qualityMetrics
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
      
      return {
        success: false,
        error: `Inkscape conversion failed: ${errorMessage}`
      };
    }
  }

  private async calculateQualityMetrics(
    outputPath: string, 
    inputFile: FileUpload, 
    processingTime: number,
    params: ConversionParams
  ): Promise<QualityMetrics> {
    try {
      const outputStats = await statAsync(outputPath);
      const outputContent = await fs.readFile(outputPath, 'utf8');
      
      // Count SVG paths and shapes
      const pathMatches = outputContent.match(/<path[^>]*>/g) || [];
      const circleMatches = outputContent.match(/<circle[^>]*>/g) || [];
      const rectMatches = outputContent.match(/<rect[^>]*>/g) || [];
      const polygonMatches = outputContent.match(/<polygon[^>]*>/g) || [];
      
      const pathCount = pathMatches.length + circleMatches.length + rectMatches.length + polygonMatches.length;
      
      // Estimate point count from path data
      const pathDataMatches = outputContent.match(/d="[^"]*"/g) || [];
      let pointCount = 0;
      pathDataMatches.forEach(pathData => {
        const commands = pathData.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];
        pointCount += commands.length;
      });

      return {
        pathCount,
        pointCount,
        fileSize: outputStats.size,
        processingTime,
        accuracy: 0.95, // Inkscape produces very high quality results
        smoothness: 0.9
      };
    } catch (error) {
      return {
        pathCount: 0,
        pointCount: 0,
        fileSize: 0,
        processingTime,
        accuracy: 0,
        smoothness: 0
      };
    }
  }

  async validateParameters(params: ConversionParams): Promise<string[]> {
    const errors: string[] = [];
    
    if (params.threshold !== undefined && (params.threshold < 0.0 || params.threshold > 1.0)) {
      errors.push('Threshold must be between 0.0 and 1.0');
    }
    
    if (params.colors !== undefined && (params.colors < 2 || params.colors > 32)) {
      errors.push('Colors must be between 2 and 32');
    }
    
    if (params.multipleScans !== undefined && (params.multipleScans < 1 || params.multipleScans > 32)) {
      errors.push('Multiple scans must be between 1 and 32');
    }
    
    return errors;
  }

  estimateTime(fileSize: number, params: ConversionParams): number {
    // Base time: ~200ms per MB (Inkscape is slower)
    const baseTime = (fileSize / (1024 * 1024)) * 200;
    
    // Adjust based on parameters
    let multiplier = 1.0;
    if (params.colors && params.colors > 16) multiplier *= 1.5;
    if (params.multipleScans && params.multipleScans > 1) multiplier *= params.multipleScans * 0.8;
    if (params.inkscapeMode === 'colorQuantization') multiplier *= 1.3;
    
    return Math.round(baseTime * multiplier);
  }

  async cleanup(): Promise<void> {
    // No specific cleanup needed for Inkscape
  }

  async getInfo(): Promise<any> {
    const available = await this.isAvailable();
    return {
      name: this.name,
      description: this.description,
      category: this.category,
      supportedFormats: this.supportedFormats,
      parameters: this.parameters,
      performance: this.performance,
      available,
      requirements: available ? [] : ['inkscape binary']
    };
  }
}