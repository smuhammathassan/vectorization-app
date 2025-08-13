import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
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
import { generateColorProfileMetadata, generateSVGColor, hexToRgb, ColorSpace } from '../../../shared/colorUtils';

const execAsync = promisify(exec);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);

export class OpenCVConverter implements IConverter {
  name = 'opencv';
  description = 'OpenCV - Contour-based vectorization with scientific precision';
  category: 'modern' = 'modern';
  supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'];
  requirements = ['python3', 'opencv-python', 'numpy'];

  parameters: ParameterDefinition[] = [
    {
      name: 'threshold',
      type: 'number',
      label: 'Binary Threshold',
      description: 'Binary threshold value (0-255, higher = cleaner separation)',
      default: 120,
      min: 0,
      max: 255,
      step: 1
    },
    {
      name: 'epsilon',
      type: 'number',
      label: 'Contour Simplification',
      description: 'Douglas-Peucker epsilon (lower = more detail, higher = smoother)',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.1
    },
    {
      name: 'minArea',
      type: 'number',
      label: 'Minimum Area',
      description: 'Minimum contour area to include (lower = more details)',
      default: 50,
      min: 1,
      max: 10000,
      step: 1
    },
    {
      name: 'colorMode',
      type: 'select',
      label: 'Color Mode',
      description: 'How to handle colors',
      default: 'binary',
      options: [
        { value: 'binary', label: 'Binary (black/white)' },
        { value: 'grayscale', label: 'Grayscale levels' },
        { value: 'color', label: 'Color separation' }
      ]
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
    },
    {
      name: 'smooth',
      type: 'boolean',
      label: 'Smooth Contours',
      description: 'Apply Gaussian smoothing before contour detection',
      default: true
    }
  ];

  performance: PerformanceInfo = {
    speed: 'fast',
    quality: 'good',
    memoryUsage: 'low',
    bestFor: ['line art', 'logos', 'simple graphics', 'technical drawings']
  };

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('python3 -c "import cv2, numpy; print(f\\"OpenCV {cv2.__version__}, NumPy {numpy.__version__}\\")"', { timeout: 10000 });
      return stdout.trim().length > 0;
    } catch {
      try {
        const { stdout } = await execAsync('python -c "import cv2, numpy; print(f\\"OpenCV {cv2.__version__}, NumPy {numpy.__version__}\\")"', { timeout: 10000 });
        return stdout.trim().length > 0;
      } catch (error) {
        console.log('OpenCV not available:', error instanceof Error ? error.message : 'Unknown error');
        return false;
      }
    }
  }

  async validateParameters(params: ConversionParams): Promise<string[]> {
    const errors: string[] = [];

    if (params.threshold !== undefined) {
      if (params.threshold < 0 || params.threshold > 255) {
        errors.push('Threshold must be between 0 and 255');
      }
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
      const scriptPath = path.resolve(__dirname, '../scripts', 'opencv_converter.py');

      // Ensure script exists
      await this.ensurePythonScript(scriptPath);

      if (onProgress) onProgress(30);

      // Build Python command arguments with improved defaults
      const paramsJson = JSON.stringify({
        threshold: params.threshold !== undefined ? params.threshold : 120,  // Higher default threshold for better separation
        epsilon: params.epsilon || 1.0,     // Better epsilon for less aggressive simplification
        minArea: params.minArea || 50,      // Lower minimum area to capture more details
        colorMode: params.colorMode || 'binary',
        smooth: params.smooth !== false
      });

      const pythonCmd = await this.getPythonCommand();
      const command = `${pythonCmd} "${scriptPath}" "${file.path}" "${outputPath}" '${paramsJson}'`;
      
      if (onProgress) onProgress(50);

      console.log('Executing OpenCV conversion:', command);
      
      // Execute conversion
      const { stdout, stderr } = await execAsync(command, {
        timeout: 180000 // 3 minutes timeout
      });

      if (stderr && !stderr.includes('UserWarning')) {
        console.warn('OpenCV conversion warnings:', stderr);
      }

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
          stdout
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
      console.error('OpenCV conversion error:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OpenCV conversion failed'
      };
    }
  }

  estimateTime(fileSize: number, params: ConversionParams): number {
    // Base time: ~1ms per KB (faster than VTracer)
    let baseTime = Math.max(1000, fileSize / 1024);
    
    // Adjust for parameters
    if (params.colorMode === 'color') {
      baseTime *= 2.0;
    } else if (params.colorMode === 'grayscale') {
      baseTime *= 1.5;
    }
    
    if (params.smooth) {
      baseTime *= 1.2;
    }

    return Math.round(baseTime);
  }

  private async getPythonCommand(): Promise<string> {
    try {
      await execAsync('python3 --version');
      return 'python3';
    } catch {
      return 'python';
    }
  }

  private async ensurePythonScript(scriptPath: string): Promise<void> {
    // Check if script already exists
    try {
      await stat(scriptPath);
      return; // Script exists, no need to recreate
    } catch {
      // Script doesn't exist, create it
    }

    const scriptDir = path.dirname(scriptPath);
    await mkdir(scriptDir, { recursive: true });

    const pythonScript = `#!/usr/bin/env python3
import cv2
import numpy as np
import json
import sys
import os

def create_svg_path(contour, scale_x=1, scale_y=1):
    """Convert OpenCV contour to SVG path string"""
    if len(contour) < 3:
        return ""
    
    path = f"M {contour[0][0][0] * scale_x} {contour[0][0][1] * scale_y}"
    
    for i in range(1, len(contour)):
        x, y = contour[i][0][0] * scale_x, contour[i][0][1] * scale_y
        path += f" L {x} {y}"
    
    path += " Z"
    return path

def process_image(image_path, output_path, params):
    """Process image using OpenCV and generate SVG"""
    
    # Read image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")
    
    height, width = img.shape[:2]
    
    # Apply smoothing if requested
    if params.get('smooth', True):
        img = cv2.GaussianBlur(img, (5, 5), 0)
    
    contours_list = []
    colors = []
    
    if params['colorMode'] == 'binary':
        # Convert to grayscale and threshold
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Invert threshold to get black shapes on white background
        _, binary = cv2.threshold(gray, params['threshold'], 255, cv2.THRESH_BINARY_INV)
        
        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            if cv2.contourArea(contour) >= params['minArea']:
                # Simplify contour
                epsilon = params['epsilon'] * cv2.arcLength(contour, True) / 100
                simplified = cv2.approxPolyDP(contour, epsilon, True)
                contours_list.append(simplified)
                colors.append('#000000')
    
    elif params['colorMode'] == 'grayscale':
        # Process multiple threshold levels
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        for threshold in range(64, 256, 64):
            # Invert threshold for proper black shapes
            _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Create proper grayscale colors (darker for lower thresholds)
            gray_value = threshold // 4  # Scale to reasonable grayscale range
            color = f"rgb({gray_value},{gray_value},{gray_value})"
            
            for contour in contours:
                if cv2.contourArea(contour) >= params['minArea']:
                    epsilon = params['epsilon'] * cv2.arcLength(contour, True) / 100
                    simplified = cv2.approxPolyDP(contour, epsilon, True)
                    contours_list.append(simplified)
                    colors.append(color)
    
    elif params['colorMode'] == 'color':
        # Process each color channel
        for channel, color_name in enumerate(['blue', 'green', 'red']):
            channel_img = img[:, :, channel]
            # Invert threshold for proper color shapes
            _, binary = cv2.threshold(channel_img, params['threshold'], 255, cv2.THRESH_BINARY_INV)
            
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Create proper RGB colors (BGR to RGB conversion)
            color_values = [0, 0, 0]
            color_values[2 - channel] = 200  # Use 200 instead of 255 for better visibility
            color = f"rgb({color_values[0]},{color_values[1]},{color_values[2]})"
            
            for contour in contours:
                if cv2.contourArea(contour) >= params['minArea']:
                    epsilon = params['epsilon'] * cv2.arcLength(contour, True) / 100
                    simplified = cv2.approxPolyDP(contour, epsilon, True)
                    contours_list.append(simplified)
                    colors.append(color)
    
    # Generate SVG
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" 
     xmlns="http://www.w3.org/2000/svg">
'''
    
    for i, (contour, color) in enumerate(zip(contours_list, colors)):
        path_data = create_svg_path(contour)
        if path_data:
            svg_content += f'  <path d="{path_data}" fill="{color}" stroke="none"/>\n'
    
    svg_content += '</svg>'
    
    # Write SVG file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    
    # Output statistics for quality metrics
    print(f"STATS:contours={len(contours_list)},points={sum(len(c) for c in contours_list)}")

def main():
    if len(sys.argv) != 4:
        print("Usage: python opencv_converter.py <input_image> <output_svg> <params_json>")
        sys.exit(1)
    
    input_path = sys.argv[1].strip('"')
    output_path = sys.argv[2].strip('"')
    params_json = sys.argv[3].strip("'")
    
    try:
        params = json.loads(params_json)
        process_image(input_path, output_path, params)
        print("Conversion completed successfully")
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

    await writeFile(scriptPath, pythonScript);
    
    // Make script executable
    try {
      await execAsync(`chmod +x "${scriptPath}"`);
    } catch {
      // Windows doesn't need chmod
    }
  }

  private async calculateQualityMetrics(
    outputPath: string, 
    inputFile: FileUpload, 
    processingTime: number,
    stdout: string
  ): Promise<QualityMetrics> {
    try {
      const outputStats = await stat(outputPath);
      
      // Parse statistics from Python script output
      let pathCount = 0;
      let pointCount = 0;
      
      const statsMatch = stdout.match(/STATS:contours=(\d+),points=(\d+)/);
      if (statsMatch) {
        pathCount = parseInt(statsMatch[1]);
        pointCount = parseInt(statsMatch[2]);
      }

      return {
        pathCount,
        pointCount,
        fileSize: outputStats.size,
        processingTime,
        accuracy: this.estimateAccuracy(pathCount, inputFile.metadata?.width, inputFile.metadata?.height),
        smoothness: 0.7 // OpenCV contours are less smooth than spline-based methods
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
    if (!width || !height) return 0.7;
    
    const totalPixels = width * height;
    const pathDensity = pathCount / (totalPixels / 1000);
    
    // OpenCV contour detection is generally accurate but less detailed than other methods
    return Math.min(0.85, 0.5 + Math.log10(pathDensity + 1) * 0.2);
  }
}