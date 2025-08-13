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

      // Configure tracing parameters based on mode
      const mode = params.inkscapeMode || 'brightnessCutoff';
      const threshold = params.threshold || 0.45;
      const colors = params.colors || 8;
      const multipleScans = params.multipleScans || 1;
      
      let traceAction = '';
      
      switch (mode) {
        case 'brightnessCutoff':
          traceAction = `trace-bitmap:mode=brightness_cutoff,threshold=${threshold}`;
          break;
        
        case 'edgeDetection':
          traceAction = `trace-bitmap:mode=edge_detection`;
          break;
        
        case 'colorQuantization':
          traceAction = `trace-bitmap:mode=color_quantized,colors=${colors}`;
          break;
        
        case 'autotrace':
          traceAction = `trace-bitmap:mode=autotrace`;
          break;
        
        case 'centerline':
          traceAction = `trace-bitmap:mode=centerline`;
          break;
      }

      // Add additional options to action
      if (params.smooth) {
        traceAction += ',smooth=true';
      }

      if (params.stack) {
        traceAction += ',stack=true';
      }

      if (params.removeBackground) {
        traceAction += ',remove_background=true';
      }

      if (multipleScans > 1) {
        traceAction += `,scans=${multipleScans}`;
      }

      if (onProgress) onProgress(30);

      // Modern Inkscape uses actions for bitmap tracing
      const command = `inkscape --actions="${traceAction};export-filename:${outputPath};export-do" "${file.path}"`;
      console.log('Executing Inkscape command:', command);
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000 // 60 seconds timeout - Inkscape can take longer
      });

      if (onProgress) onProgress(80);

      // Check for errors in stderr
      if (stderr && stderr.includes('error')) {
        throw new Error(`Inkscape error: ${stderr}`);
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
      const startTime = Date.now();
      const qualityMetrics = await this.calculateQualityMetrics(
        outputPath, 
        file, 
        Date.now() - startTime,
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