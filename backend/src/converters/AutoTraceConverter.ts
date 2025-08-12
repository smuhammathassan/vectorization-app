import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { stat } from 'fs';
import { promisify } from 'util';
import path from 'path';
import sharp from 'sharp';

const execAsync = promisify(exec);
import { IConverter } from './IConverter';
import { FileUpload, ConversionParams, QualityMetrics, ConversionResult, PerformanceInfo, ParameterDefinition } from '../../../shared/types';
import { generateId } from '../../../shared/utils';
import { SVGCleanerConverter } from './SVGCleanerConverter';

const statAsync = promisify(stat);

export class AutoTraceConverter implements IConverter {
  name: string = 'autotrace';
  description: string = 'AutoTrace - Professional line art and logo vectorization with edge detection';
  category: 'traditional' = 'traditional';
  supportedFormats: string[] = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'];
  
  private svgCleaner = new SVGCleanerConverter();

  parameters: ParameterDefinition[] = [
    {
      name: 'colorCount',
      type: 'number',
      label: 'Color Count',
      description: 'Number of colors to reduce to (1-256) - Lower values create smaller files',
      default: 4,
      min: 1,
      max: 256,
      step: 1
    },
    {
      name: 'despeckleLevel',
      type: 'number',
      label: 'Despeckle Level',
      description: 'Remove speckles smaller than this size (pixels) - Higher values reduce file size',
      default: 5,
      min: 0,
      max: 20,
      step: 1
    },
    {
      name: 'cornerThreshold',
      type: 'number',
      label: 'Corner Threshold',
      description: 'Corner detection threshold (0-100) - Lower values create smoother curves',
      default: 70,
      min: 0,
      max: 100,
      step: 1
    },
    {
      name: 'errorThreshold',
      type: 'number',
      label: 'Error Threshold',
      description: 'Error threshold for curve fitting (0.5-10.0) - Higher values create simpler paths',
      default: 6.0,
      min: 0.5,
      max: 10.0,
      step: 0.1
    },
    {
      name: 'filterIterations',
      type: 'number',
      label: 'Filter Iterations',
      description: 'Number of filter iterations for smoothing (0-10) - More iterations = smoother result',
      default: 6,
      min: 0,
      max: 10,
      step: 1
    },
    {
      name: 'lineThreshold',
      type: 'number',
      label: 'Line Threshold',
      description: 'Straight line detection threshold (0.2-2.0) - Higher values convert more curves to lines',
      default: 1.5,
      min: 0.2,
      max: 2.0,
      step: 0.1
    },
    {
      name: 'tangentSurround',
      type: 'number',
      label: 'Tangent Surround',
      description: 'Points to consider for tangent calculation (2-10) - Higher values = smoother curves',
      default: 4,
      min: 2,
      max: 10,
      step: 1
    },
    {
      name: 'lineReversionThreshold',
      type: 'number',
      label: 'Line Reversion Threshold',
      description: 'Curve to line conversion threshold (0.01-1.0) - Higher values create more straight lines',
      default: 0.05,
      min: 0.01,
      max: 1.0,
      step: 0.01
    },
    {
      name: 'centerline',
      type: 'boolean',
      label: 'Centerline Tracing',
      description: 'Use centerline tracing for stroke-based images',
      default: false
    },
    {
      name: 'preserveWidth',
      type: 'boolean',
      label: 'Preserve Width',
      description: 'Preserve line width information in centerline mode',
      default: false
    },
    {
      name: 'removeAdjacentCorners',
      type: 'boolean',
      label: 'Remove Adjacent Corners',
      description: 'Remove unnecessary adjacent corner points to reduce file size',
      default: true
    },
    {
      name: 'preprocessImage',
      type: 'boolean',
      label: 'Preprocess Large Images',
      description: 'Automatically downscale and smooth large images to reduce output complexity',
      default: true
    }
  ];

  performance: PerformanceInfo = {
    speed: 'medium',
    quality: 'excellent',
    memoryUsage: 'medium',
    bestFor: ['line art', 'logos', 'technical drawings', 'sketches', 'illustrations']
  };

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync('autotrace --version', { timeout: 5000 });
      return stdout.includes('autotrace') || stderr.includes('autotrace') || stdout.trim().length > 0;
    } catch (error) {
      console.log('AutoTrace not available:', error instanceof Error ? error.message : 'Binary not found');
      return false;
    }
  }

  async convert(
    file: FileUpload,
    params: ConversionParams = {},
    onProgress?: (progress: number) => void
  ): Promise<ConversionResult> {
    
    try {
      if (onProgress) onProgress(5);

      // Generate output filename
      const outputId = generateId();
      const outputPath = path.resolve(__dirname, '../../outputs', `${outputId}.svg`);
      
      // Preprocess image if needed
      let inputPath = file.path;
      if (params.preprocessImage !== false) {
        inputPath = await this.preprocessImage(file, onProgress);
      }
      
      if (onProgress) onProgress(20);

      // Build autotrace command with parameters
      const args = [];
      
      // Input and output format
      args.push('-input-format', this.getInputFormat(file.originalName));
      args.push('-output-format', 'svg');
      
      // Color reduction
      if (params.colorCount !== undefined) {
        args.push('-color-count', params.colorCount.toString());
      }
      
      // Despeckle level
      if (params.despeckleLevel !== undefined) {
        args.push('-despeckle-level', params.despeckleLevel.toString());
      }
      
      // Corner threshold
      if (params.cornerThreshold !== undefined) {
        args.push('-corner-threshold', params.cornerThreshold.toString());
      }
      
      // Error threshold
      if (params.errorThreshold !== undefined) {
        args.push('-error-threshold', params.errorThreshold.toString());
      }
      
      // Filter iterations
      if (params.filterIterations !== undefined) {
        args.push('-filter-iterations', params.filterIterations.toString());
      }
      
      // Line threshold
      if (params.lineThreshold !== undefined) {
        args.push('-line-threshold', params.lineThreshold.toString());
      }
      
      // Tangent surround
      if (params.tangentSurround !== undefined) {
        args.push('-tangent-surround', params.tangentSurround.toString());
      }
      
      // Line reversion threshold
      if (params.lineReversionThreshold !== undefined) {
        args.push('-line-reversion-threshold', params.lineReversionThreshold.toString());
      }
      
      // Remove adjacent corners optimization
      if (params.removeAdjacentCorners !== false) {
        args.push('-remove-adjacent-corners');
      }
      
      // Centerline tracing
      if (params.centerline) {
        args.push('-centerline');
      }
      
      // Preserve width
      if (params.preserveWidth) {
        args.push('-preserve-width');
      }
      
      // Output file
      args.push('-output-file', outputPath);
      
      // Input file (must be last)
      args.push(inputPath);

      if (onProgress) onProgress(30);

      // Execute autotrace
      const command = `autotrace ${args.join(' ')}`;
      console.log('Executing AutoTrace command:', command);
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000 // 60 seconds timeout
      });

      if (onProgress) onProgress(80);

      // Check for errors in stderr
      if (stderr && stderr.toLowerCase().includes('error')) {
        throw new Error(`AutoTrace error: ${stderr}`);
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

      if (onProgress) onProgress(80);
      
      // Post-process SVG to optimize and reduce size
      let finalOutputPath = outputPath;
      try {
        console.log('Post-processing SVG with cleaner...');
        const outputStats = await statAsync(outputPath);
        const cleanedResult = await this.postProcessSVG(outputPath, onProgress);
        if (cleanedResult.success && cleanedResult.outputPath) {
          finalOutputPath = cleanedResult.outputPath;
          const finalStats = await statAsync(finalOutputPath);
          console.log(`SVG cleaned: ${outputStats.size} bytes → ${finalStats.size} bytes`);
        }
      } catch (error) {
        console.warn('SVG post-processing failed, using original:', error);
      }

      if (onProgress) onProgress(95);

      // Calculate quality metrics
      const startTime = Date.now();
      const qualityMetrics = await this.calculateQualityMetrics(
        finalOutputPath, 
        file, 
        Date.now() - startTime,
        params
      );

      if (onProgress) onProgress(100);

      return {
        success: true,
        outputPath: finalOutputPath,
        qualityMetrics
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
      
      return {
        success: false,
        error: `AutoTrace conversion failed: ${errorMessage}`
      };
    }
  }

  private getInputFormat(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.png':
        return 'png';
      case '.jpg':
      case '.jpeg':
        return 'jpeg';
      case '.bmp':
        return 'bmp';
      case '.tiff':
      case '.tif':
        return 'tiff';
      default:
        return 'png'; // Default fallback
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
      const lineMatches = outputContent.match(/<line[^>]*>/g) || [];
      
      const pathCount = pathMatches.length + circleMatches.length + rectMatches.length + 
                       polygonMatches.length + lineMatches.length;
      
      // Estimate point count from path data
      const pathDataMatches = outputContent.match(/d="[^"]*"/g) || [];
      let pointCount = 0;
      pathDataMatches.forEach(pathData => {
        const commands = pathData.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];
        pointCount += commands.length;
      });

      // Calculate accuracy based on parameters used
      let accuracy = 0.85; // Base accuracy for AutoTrace
      if (params.errorThreshold && params.errorThreshold < 2.0) accuracy += 0.05;
      if (params.cornerThreshold && params.cornerThreshold > 50) accuracy += 0.05;
      if (params.filterIterations && params.filterIterations > 2) accuracy += 0.03;
      
      return {
        pathCount,
        pointCount,
        fileSize: outputStats.size,
        processingTime,
        accuracy: Math.min(accuracy, 0.98),
        smoothness: 0.85 // AutoTrace produces smooth curves
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

  private async postProcessSVG(svgPath: string, onProgress?: (progress: number) => void): Promise<ConversionResult> {
    try {
      // Create a fake FileUpload object for the SVG cleaner
      const svgFile: FileUpload = {
        id: generateId(),
        originalName: 'temp.svg',
        filename: path.basename(svgPath),
        mimetype: 'image/svg+xml',
        size: (await statAsync(svgPath)).size,
        uploadedAt: new Date(),
        path: svgPath
      };
      
      // Use aggressive cleaning settings
      const cleaningParams = {
        precision: 2, // Higher precision reduction
        removeUnused: true,
        removeHidden: true,
        removeComments: true,
        removeMetadata: true,
        optimizePaths: true,
        mergeStyles: true,
        removeEmptyGroups: true
      };
      
      if (onProgress) onProgress(85);
      
      return await this.svgCleaner.convert(svgFile, cleaningParams, onProgress);
      
    } catch (error) {
      console.warn('SVG post-processing error:', error);
      return { success: false, error: 'SVG cleaning failed' };
    }
  }

  private async preprocessImage(file: FileUpload, onProgress?: (progress: number) => void): Promise<string> {
    try {
      // Get image metadata
      const metadata = await sharp(file.path).metadata();
      const { width = 0, height = 0 } = metadata;
      
      // Skip preprocessing for small images
      if (width * height < 800 * 600) {
        return file.path;
      }
      
      if (onProgress) onProgress(10);
      
      // Generate preprocessed filename
      const preprocessedId = generateId();
      const preprocessedPath = path.resolve(__dirname, '../../temp', `preprocessed_${preprocessedId}.png`);
      
      // Calculate target size (max 1024x768 while maintaining aspect ratio)
      let targetWidth = width;
      let targetHeight = height;
      const maxDimension = 1024;
      
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        targetWidth = Math.round(width * ratio);
        targetHeight = Math.round(height * ratio);
      }
      
      if (onProgress) onProgress(15);
      
      // Process image: resize, slight blur, and quantize colors
      await sharp(file.path)
        .resize(targetWidth, targetHeight, { 
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true 
        })
        .blur(0.5) // Slight blur to reduce fine details
        .png({ 
          colors: 32, // Reduce colors to simplify tracing
          quality: 90 
        })
        .toFile(preprocessedPath);
      
      console.log(`Preprocessed image: ${width}x${height} → ${targetWidth}x${targetHeight}`);
      return preprocessedPath;
      
    } catch (error) {
      console.warn('Image preprocessing failed, using original:', error);
      return file.path;
    }
  }

  async validateParameters(params: ConversionParams): Promise<string[]> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (params.colorCount !== undefined && (params.colorCount < 1 || params.colorCount > 256)) {
      errors.push('Color count must be between 1 and 256');
    }
    
    if (params.despeckleLevel !== undefined && (params.despeckleLevel < 0 || params.despeckleLevel > 20)) {
      errors.push('Despeckle level must be between 0 and 20');
    }
    
    if (params.cornerThreshold !== undefined && (params.cornerThreshold < 0 || params.cornerThreshold > 100)) {
      errors.push('Corner threshold must be between 0 and 100');
    }
    
    if (params.errorThreshold !== undefined && (params.errorThreshold < 0.5 || params.errorThreshold > 10.0)) {
      errors.push('Error threshold must be between 0.5 and 10.0');
    }
    
    if (params.filterIterations !== undefined && (params.filterIterations < 0 || params.filterIterations > 10)) {
      errors.push('Filter iterations must be between 0 and 10');
    }
    
    if (params.lineThreshold !== undefined && (params.lineThreshold < 0.2 || params.lineThreshold > 2.0)) {
      errors.push('Line threshold must be between 0.2 and 2.0');
    }
    
    if (params.tangentSurround !== undefined && (params.tangentSurround < 2 || params.tangentSurround > 10)) {
      errors.push('Tangent surround must be between 2 and 10');
    }
    
    if (params.lineReversionThreshold !== undefined && (params.lineReversionThreshold < 0.01 || params.lineReversionThreshold > 1.0)) {
      errors.push('Line reversion threshold must be between 0.01 and 1.0');
    }
    
    // File size warnings
    if (params.colorCount && params.colorCount > 8) {
      warnings.push('High color count (>8) may produce very large files');
    }
    
    if (params.errorThreshold && params.errorThreshold < 3.0) {
      warnings.push('Low error threshold (<3.0) may create overly detailed paths and large files');
    }
    
    if (params.despeckleLevel !== undefined && params.despeckleLevel < 3) {
      warnings.push('Low despeckle level (<3) may retain noise and increase file size');
    }
    
    // Log warnings to console for debugging
    if (warnings.length > 0) {
      console.warn('AutoTrace parameter warnings:', warnings);
    }
    
    return errors;
  }

  estimateTime(fileSize: number, params: ConversionParams): number {
    // Base time: ~100ms per MB
    const baseTime = (fileSize / (1024 * 1024)) * 100;
    
    // Adjust based on parameters
    let multiplier = 1.0;
    if (params.colorCount && params.colorCount > 16) multiplier *= 1.3;
    if (params.filterIterations && params.filterIterations > 4) multiplier *= 1.2;
    if (params.centerline) multiplier *= 1.5; // Centerline tracing is slower
    
    return Math.round(baseTime * multiplier);
  }

  async cleanup(): Promise<void> {
    // No specific cleanup needed for AutoTrace
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
      requirements: available ? [] : ['autotrace binary']
    };
  }
}