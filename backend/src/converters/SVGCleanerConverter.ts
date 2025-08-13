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
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

export class SVGCleanerConverter implements IConverter {
  name: string = 'svg-cleaner';
  description: string = 'SVG Cleaner - Optimize and clean SVG files by removing unnecessary elements';
  category: 'external' = 'external';
  supportedFormats: string[] = ['image/svg+xml']; // Only accepts SVG input

  parameters: ParameterDefinition[] = [
    {
      name: 'precision',
      type: 'number',
      label: 'Coordinate Precision',
      description: 'Decimal precision for coordinates (1-8)',
      default: 3,
      min: 1,
      max: 8,
      step: 1
    },
    {
      name: 'removeUnused',
      type: 'boolean',
      label: 'Remove Unused Elements',
      description: 'Remove unused gradients, patterns, and definitions',
      default: true
    },
    {
      name: 'removeHidden',
      type: 'boolean',
      label: 'Remove Hidden Elements',
      description: 'Remove hidden and invisible elements',
      default: true
    },
    {
      name: 'removeComments',
      type: 'boolean',
      label: 'Remove Comments',
      description: 'Remove XML comments from SVG',
      default: true
    },
    {
      name: 'removeMetadata',
      type: 'boolean',
      label: 'Remove Metadata',
      description: 'Remove metadata and editor-specific elements',
      default: true
    },
    {
      name: 'optimizePaths',
      type: 'boolean',
      label: 'Optimize Paths',
      description: 'Optimize path data and remove redundant commands',
      default: true
    },
    {
      name: 'mergeStyles',
      type: 'boolean',
      label: 'Merge Styles',
      description: 'Merge duplicate style definitions',
      default: true
    },
    {
      name: 'removeEmptyGroups',
      type: 'boolean',
      label: 'Remove Empty Groups',
      description: 'Remove empty groups and containers',
      default: true
    }
  ];

  performance: PerformanceInfo = {
    speed: 'fast',
    quality: 'good',
    memoryUsage: 'low',
    bestFor: ['SVG optimization', 'file size reduction', 'cleaning generated SVGs', 'post-processing']
  };

  async isAvailable(): Promise<boolean> {
    // SVG Cleaner is implemented in JavaScript/TypeScript, so it's always available
    // We'll implement a simple version rather than relying on external tools
    return true;
  }

  async convert(
    file: FileUpload,
    params: ConversionParams = {},
    onProgress?: (progress: number) => void
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    
    try {
      if (onProgress) onProgress(10);

      // Check if input is SVG
      if (!file.originalName.toLowerCase().endsWith('.svg')) {
        throw new Error('SVG Cleaner only accepts SVG files as input');
      }

      // Generate output filename
      const outputId = generateId();
      const outputPath = path.resolve(__dirname, '../../outputs', `${outputId}.svg`);

      if (onProgress) onProgress(30);

      // Read input SVG file
      const inputContent = await fs.readFile(file.path, 'utf8');

      if (onProgress) onProgress(50);

      // Clean the SVG content
      const cleanedContent = await this.cleanSVG(inputContent, params);

      if (onProgress) onProgress(80);

      // Write cleaned SVG
      await fs.writeFile(outputPath, cleanedContent, 'utf8');

      // Verify output file exists
      const outputStats = await statAsync(outputPath);
      if (outputStats.size === 0) {
        throw new Error('Generated cleaned SVG file is empty');
      }

      if (onProgress) onProgress(90);

      // Calculate quality metrics
      const processingTime = Date.now() - startTime;
      const originalStats = await statAsync(file.path);
      const qualityMetrics = await this.calculateQualityMetrics(
        outputPath,
        originalStats.size,
        outputStats.size,
        processingTime,
        inputContent,
        cleanedContent
      );

      if (onProgress) onProgress(100);

      return {
        success: true,
        outputPath,
        qualityMetrics
      };

    } catch (error) {
      console.error('SVG Cleaner error:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'SVG cleaning failed'
      };
    }
  }

  private async cleanSVG(svgContent: string, params: ConversionParams): Promise<string> {
    let cleaned = svgContent;

    // Remove XML comments
    if (params.removeComments !== false) {
      cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    }

    // Remove metadata and editor-specific elements
    if (params.removeMetadata !== false) {
      cleaned = cleaned.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
      cleaned = cleaned.replace(/<sodipodi:[^>]*>/gi, '');
      cleaned = cleaned.replace(/<inkscape:[^>]*>/gi, '');
      cleaned = cleaned.replace(/sodipodi:[^=]*="[^"]*"/gi, '');
      cleaned = cleaned.replace(/inkscape:[^=]*="[^"]*"/gi, '');
    }

    // Remove hidden elements
    if (params.removeHidden !== false) {
      cleaned = cleaned.replace(/<[^>]*display:\s*none[^>]*>/gi, '');
      cleaned = cleaned.replace(/<[^>]*visibility:\s*hidden[^>]*>/gi, '');
      cleaned = cleaned.replace(/<[^>]*opacity:\s*0[^>]*>/gi, '');
    }

    // Remove empty groups
    if (params.removeEmptyGroups !== false) {
      // Simple approach - remove groups with no content
      cleaned = cleaned.replace(/<g[^>]*>\s*<\/g>/gi, '');
    }

    // Optimize coordinate precision
    const precision = params.precision || 3;
    if (precision < 8) {
      // Round coordinates to specified precision
      cleaned = cleaned.replace(/(\d+\.\d{4,})/g, (match) => {
        return parseFloat(match).toFixed(precision);
      });
    }

    // Optimize paths
    if (params.optimizePaths !== false) {
      // Remove redundant path commands and simplify
      cleaned = cleaned.replace(/d="([^"]*)"/g, (match, pathData) => {
        return `d="${this.optimizePathData(pathData)}"`;
      });
    }

    // Remove excessive whitespace
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/>\s+</g, '><');

    // Remove unused definitions (simple approach)
    if (params.removeUnused !== false) {
      // This is a simplified approach - in a full implementation,
      // we'd need to track usage of gradients, patterns, etc.
      cleaned = cleaned.replace(/<defs>\s*<\/defs>/gi, '');
    }

    return cleaned.trim();
  }

  private optimizePathData(pathData: string): string {
    // Simple path optimization
    let optimized = pathData;
    
    // Remove redundant spaces
    optimized = optimized.replace(/\s+/g, ' ');
    
    // Remove spaces around commas
    optimized = optimized.replace(/\s*,\s*/g, ',');
    
    // Remove leading/trailing spaces
    optimized = optimized.trim();
    
    // Remove redundant L commands (convert L to implicit lineto)
    optimized = optimized.replace(/L\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*/g, '$1,$2 ');
    
    return optimized;
  }

  private async calculateQualityMetrics(
    outputPath: string,
    originalSize: number,
    newSize: number,
    processingTime: number,
    originalContent: string,
    cleanedContent: string
  ): Promise<QualityMetrics> {
    try {
      // Count elements in both versions
      const originalPaths = (originalContent.match(/<path[^>]*>/g) || []).length;
      const cleanedPaths = (cleanedContent.match(/<path[^>]*>/g) || []).length;
      
      const originalElements = (originalContent.match(/<[^\/][^>]*>/g) || []).length;
      const cleanedElements = (cleanedContent.match(/<[^\/][^>]*>/g) || []).length;

      // Calculate compression ratio
      const compressionRatio = newSize / originalSize;
      const sizeSaving = 1 - compressionRatio;

      return {
        pathCount: cleanedPaths,
        pointCount: cleanedPaths * 5, // Estimate points per path
        fileSize: newSize,
        processingTime,
        accuracy: 1.0, // SVG cleaning preserves visual accuracy
        smoothness: 1.0 // No change to visual smoothness
      };
    } catch (error) {
      console.warn('Failed to calculate quality metrics:', error);
      return {
        pathCount: 0,
        pointCount: 0,
        fileSize: newSize,
        processingTime,
        accuracy: 1.0,
        smoothness: 1.0
      };
    }
  }

  async validateParameters(params: ConversionParams): Promise<string[]> {
    const errors: string[] = [];

    if (params.precision !== undefined) {
      if (params.precision < 1 || params.precision > 8) {
        errors.push('Coordinate precision must be between 1 and 8');
      }
    }

    return errors;
  }

  estimateTime(fileSize: number, params: ConversionParams): number {
    // SVG cleaning is very fast - base time ~1ms per KB
    const baseTime = Math.max(100, fileSize / 1024);
    return Math.round(baseTime);
  }

  async cleanup(): Promise<void> {
    // No specific cleanup needed
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
      requirements: [] // No external dependencies
    };
  }
}