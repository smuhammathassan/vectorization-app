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

export class PotraceConverter implements IConverter {
  name: string = 'potrace';
  description: string = 'Potrace - Traditional black and white vectorization with bitmap tracing';
  category: 'traditional' = 'traditional';
  supportedFormats: string[] = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'];

  parameters: ParameterDefinition[] = [
    {
      name: 'threshold',
      type: 'number',
      label: 'Binary Threshold',
      description: 'Threshold for black/white conversion (0-1)',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01
    },
    {
      name: 'turnPolicy',
      type: 'select',
      label: 'Turn Policy',
      description: 'How to resolve ambiguities in path decomposition',
      default: 'minority',
      options: [
        { value: 'black', label: 'Black - prefer black pixels' },
        { value: 'white', label: 'White - prefer white pixels' },
        { value: 'left', label: 'Left - always take left turn' },
        { value: 'right', label: 'Right - always take right turn' },
        { value: 'minority', label: 'Minority - prefer minority color' },
        { value: 'majority', label: 'Majority - prefer majority color' },
        { value: 'random', label: 'Random - choose randomly' }
      ]
    },
    {
      name: 'turdSize',
      type: 'number',
      label: 'Suppress Speckles',
      description: 'Suppress speckles of up to this size (pixels)',
      default: 2,
      min: 0,
      max: 100,
      step: 1
    },
    {
      name: 'alphaMax',
      type: 'number',
      label: 'Alpha Max',
      description: 'Corner detection threshold (0-1.334, higher = smoother)',
      default: 1.0,
      min: 0,
      max: 1.334,
      step: 0.01
    },
    {
      name: 'longCoding',
      type: 'boolean',
      label: 'Long Coding',
      description: 'Turn on long coding optimization',
      default: false
    },
    {
      name: 'opttolerance',
      type: 'number',
      label: 'Optimization Tolerance',
      description: 'Optimize tolerance for curve fitting',
      default: 0.2,
      min: 0,
      max: 2.0,
      step: 0.01
    }
  ];

  performance: PerformanceInfo = {
    speed: 'fast',
    quality: 'good',
    memoryUsage: 'low',
    bestFor: ['line art', 'logos', 'black and white images', 'sketches', 'text']
  };

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync('potrace --version', { timeout: 5000 });
      return stdout.includes('potrace') || stderr.includes('potrace') || stdout.trim().length > 0;
    } catch (error) {
      console.log('Potrace not available:', error instanceof Error ? error.message : 'Binary not found');
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

      // Build potrace command
      const args = [
        '--svg',
        '--output', outputPath
      ];

      // Add parameters
      if (params.threshold !== undefined) {
        args.push('--threshold', params.threshold.toString());
      }

      if (params.turnPolicy) {
        args.push('--turnpolicy', params.turnPolicy);
      }

      if (params.turdSize !== undefined) {
        args.push('--turdsize', params.turdSize.toString());
      }

      if (params.alphaMax !== undefined) {
        args.push('--alphamax', params.alphaMax.toString());
      }

      if (params.longCoding) {
        args.push('--longcoding');
      }

      if (params.opttolerance !== undefined) {
        args.push('--opttolerance', params.opttolerance.toString());
      }

      // Add input file
      args.push(file.path);

      if (onProgress) onProgress(30);

      // Execute potrace
      const command = `potrace ${args.join(' ')}`;
      console.log('Executing Potrace command:', command);
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000 // 30 seconds timeout
      });

      const result = { code: 0, stderr };

      if (onProgress) onProgress(80);

      if (result.code !== 0) {
        throw new Error(`Potrace failed with code ${result.code}: ${result.stderr}`);
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
        error: `Potrace conversion failed: ${errorMessage}`
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
      
      // Count SVG paths (approximate path count)
      const pathMatches = outputContent.match(/<path[^>]*>/g) || [];
      const pathCount = pathMatches.length;
      
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
        accuracy: 0.85, // Potrace is good for line art
        smoothness: 0.8
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
    
    return errors;
  }

  estimateTime(fileSize: number, params: ConversionParams): number {
    // Base time: ~50ms per MB
    const baseTime = (fileSize / (1024 * 1024)) * 50;
    
    // Adjust based on parameters
    let multiplier = 1.0;
    if (params.turdSize && params.turdSize < 5) multiplier *= 1.2;
    if (params.alphaMax && params.alphaMax > 1.0) multiplier *= 1.1;
    
    return Math.round(baseTime * multiplier);
  }

  async cleanup(): Promise<void> {
    // No specific cleanup needed for Potrace
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
      requirements: available ? [] : ['potrace binary']
    };
  }
}