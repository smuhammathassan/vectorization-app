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

export class PrimitiveConverter implements IConverter {
  name: string = 'primitive';
  description: string = 'Primitive - Artistic geometric vectorization using shapes like triangles and ellipses';
  category: 'modern' = 'modern';
  supportedFormats: string[] = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp'];

  parameters: ParameterDefinition[] = [
    {
      name: 'shapeCount',
      type: 'number',
      label: 'Shape Count',
      description: 'Number of geometric shapes to use (10-500)',
      default: 100,
      min: 10,
      max: 500,
      step: 10
    },
    {
      name: 'shapeType',
      type: 'select',
      label: 'Shape Type',
      description: 'Type of geometric primitives to use',
      default: 'mixed',
      options: [
        { value: 'triangle', label: 'Triangles only' },
        { value: 'ellipse', label: 'Ellipses only' },
        { value: 'rectangle', label: 'Rectangles only' },
        { value: 'circle', label: 'Circles only' },
        { value: 'mixed', label: 'Mixed shapes' }
      ]
    },
    {
      name: 'iterations',
      type: 'number',
      label: 'Iterations',
      description: 'Number of iterations per shape (100-10000)',
      default: 1000,
      min: 100,
      max: 10000,
      step: 100
    },
    {
      name: 'alpha',
      type: 'number',
      label: 'Shape Alpha',
      description: 'Transparency of shapes (0.1-1.0)',
      default: 0.5,
      min: 0.1,
      max: 1.0,
      step: 0.1
    },
    {
      name: 'background',
      type: 'select',
      label: 'Background',
      description: 'Background color strategy',
      default: 'average',
      options: [
        { value: 'average', label: 'Average color' },
        { value: 'dominant', label: 'Dominant color' },
        { value: 'white', label: 'White' },
        { value: 'black', label: 'Black' },
        { value: 'transparent', label: 'Transparent' }
      ]
    },
    {
      name: 'resize',
      type: 'number',
      label: 'Resize Factor',
      description: 'Resize input image (0.1-2.0, 1.0=original size)',
      default: 1.0,
      min: 0.1,
      max: 2.0,
      step: 0.1
    }
  ];

  performance: PerformanceInfo = {
    speed: 'slow',
    quality: 'good',
    memoryUsage: 'medium',
    bestFor: ['artistic rendering', 'abstract art', 'creative projects', 'stylized graphics']
  };

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Python and required libraries are available
      const { stdout } = await execAsync('python3 -c "import PIL, numpy, random; print(\'Primitive dependencies available\')"', { timeout: 10000 });
      return stdout.includes('available');
    } catch {
      try {
        const { stdout } = await execAsync('python -c "import PIL, numpy, random; print(\'Primitive dependencies available\')"', { timeout: 10000 });
        return stdout.includes('available');
      } catch (error) {
        console.log('Primitive not available:', error instanceof Error ? error.message : 'Dependencies not found');
        return false;
      }
    }
  }

  async convert(
    file: FileUpload,
    params: ConversionParams = {},
    onProgress?: (progress: number) => void
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    
    try {
      if (onProgress) onProgress(10);

      // Generate output filename
      const outputId = generateId();
      const outputPath = path.resolve(__dirname, '../../outputs', `${outputId}.svg`);
      const scriptPath = path.resolve(__dirname, '../scripts', 'primitive_converter.py');

      // Ensure script exists
      await this.ensurePythonScript(scriptPath);

      if (onProgress) onProgress(30);

      // Build Python command arguments
      const paramsJson = JSON.stringify({
        shapeCount: params.shapeCount || 100,
        shapeType: params.shapeType || 'mixed',
        iterations: params.iterations || 1000,
        alpha: params.alpha || 0.5,
        background: params.background || 'average',
        resize: params.resize || 1.0
      });

      const pythonCmd = await this.getPythonCommand();
      const command = `${pythonCmd} "${scriptPath}" "${file.path}" "${outputPath}" '${paramsJson}'`;
      
      if (onProgress) onProgress(50);

      console.log('Executing Primitive conversion:', command);
      
      // Execute conversion with longer timeout due to iterative nature
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000 // 5 minutes timeout
      });

      if (stderr && !stderr.includes('UserWarning')) {
        console.warn('Primitive conversion warnings:', stderr);
      }

      if (onProgress) onProgress(80);

      // Check if output file was created
      try {
        const outputStats = await statAsync(outputPath);
        
        if (onProgress) onProgress(95);

        // Calculate quality metrics
        const processingTime = Date.now() - startTime;
        const qualityMetrics = await this.calculateQualityMetrics(
          outputPath, 
          file, 
          processingTime,
          stdout,
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
      console.error('Primitive conversion error:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Primitive conversion failed'
      };
    }
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
      await statAsync(scriptPath);
      return; // Script exists, no need to recreate
    } catch {
      // Script doesn't exist, create it
    }

    const scriptDir = path.dirname(scriptPath);
    await mkdir(scriptDir, { recursive: true });

    const pythonScript = `#!/usr/bin/env python3
import random
import json
import sys
import math
from PIL import Image, ImageDraw, ImageStat
import numpy as np

class Shape:
    def __init__(self, shape_type, bounds, color, alpha):
        self.shape_type = shape_type
        self.bounds = bounds
        self.color = color
        self.alpha = alpha
    
    def mutate(self, image_size):
        """Create a mutated version of this shape"""
        new_shape = Shape(self.shape_type, self.bounds.copy(), self.color, self.alpha)
        
        # Mutate position and size
        for i in range(len(new_shape.bounds)):
            if random.random() < 0.3:  # 30% chance to mutate each coordinate
                if i < 2:  # x, y coordinates
                    new_shape.bounds[i] += random.randint(-20, 20)
                    new_shape.bounds[i] = max(0, min(image_size[i % 2], new_shape.bounds[i]))
                else:  # width, height
                    new_shape.bounds[i] += random.randint(-10, 10)
                    new_shape.bounds[i] = max(5, new_shape.bounds[i])
        
        # Mutate color
        if random.random() < 0.2:  # 20% chance to mutate color
            new_color = list(new_shape.color)
            for i in range(3):
                new_color[i] += random.randint(-30, 30)
                new_color[i] = max(0, min(255, new_color[i]))
            new_shape.color = tuple(new_color)
        
        return new_shape

def create_random_shape(shape_type, image_size, target_colors):
    """Create a random shape of the specified type"""
    width, height = image_size
    color = random.choice(target_colors)
    
    if shape_type == 'triangle':
        # Random triangle
        x1 = random.randint(0, width)
        y1 = random.randint(0, height)
        x2 = random.randint(0, width)
        y2 = random.randint(0, height)
        x3 = random.randint(0, width)
        y3 = random.randint(0, height)
        bounds = [x1, y1, x2, y2, x3, y3]
    elif shape_type == 'ellipse' or shape_type == 'circle':
        # Random ellipse/circle
        x = random.randint(0, width)
        y = random.randint(0, height)
        if shape_type == 'circle':
            r = random.randint(5, min(width, height) // 4)
            bounds = [x - r, y - r, x + r, y + r]
        else:
            w = random.randint(10, width // 3)
            h = random.randint(10, height // 3)
            bounds = [x - w//2, y - h//2, x + w//2, y + h//2]
    else:  # rectangle
        # Random rectangle
        x = random.randint(0, width)
        y = random.randint(0, height)
        w = random.randint(10, width // 3)
        h = random.randint(10, height // 3)
        bounds = [x, y, x + w, y + h]
    
    return Shape(shape_type, bounds, color, 0.5)

def draw_shape(draw, shape):
    """Draw a shape on the given ImageDraw object"""
    color_with_alpha = shape.color + (int(shape.alpha * 255),)
    
    if shape.shape_type == 'triangle':
        # Draw triangle
        points = [(shape.bounds[0], shape.bounds[1]), 
                 (shape.bounds[2], shape.bounds[3]), 
                 (shape.bounds[4], shape.bounds[5])]
        draw.polygon(points, fill=color_with_alpha)
    elif shape.shape_type == 'ellipse' or shape.shape_type == 'circle':
        # Draw ellipse/circle
        draw.ellipse(shape.bounds, fill=color_with_alpha)
    else:  # rectangle
        # Draw rectangle
        draw.rectangle(shape.bounds, fill=color_with_alpha)

def calculate_fitness(image1, image2):
    """Calculate fitness score between two images using MSE"""
    arr1 = np.array(image1)
    arr2 = np.array(image2)
    mse = np.mean((arr1 - arr2) ** 2)
    return -mse  # Negative because we want to minimize error

def get_dominant_colors(image, num_colors=16):
    """Extract dominant colors from image"""
    # Resize for faster processing
    image = image.resize((150, 150))
    
    # Convert to RGB if necessary
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Get pixel data
    pixels = list(image.getdata())
    
    # Simple color quantization
    colors = {}
    for pixel in pixels:
        # Quantize colors to reduce complexity
        quantized = tuple(c // 32 * 32 for c in pixel)
        colors[quantized] = colors.get(quantized, 0) + 1
    
    # Get most common colors
    sorted_colors = sorted(colors.items(), key=lambda x: x[1], reverse=True)
    return [color for color, count in sorted_colors[:num_colors]]

def get_background_color(image, background_type):
    """Get background color based on strategy"""
    if background_type == 'white':
        return (255, 255, 255)
    elif background_type == 'black':
        return (0, 0, 0)
    elif background_type == 'transparent':
        return (255, 255, 255, 0)
    elif background_type == 'average':
        stat = ImageStat.Stat(image)
        return tuple(int(c) for c in stat.mean[:3])
    else:  # dominant
        colors = get_dominant_colors(image, 1)
        return colors[0] if colors else (128, 128, 128)

def primitive_vectorize(input_path, output_path, params):
    """Main primitive vectorization function"""
    
    # Load and process input image
    image = Image.open(input_path).convert('RGB')
    
    # Resize if requested
    if params['resize'] != 1.0:
        new_size = (int(image.size[0] * params['resize']), 
                   int(image.size[1] * params['resize']))
        image = image.resize(new_size, Image.LANCZOS)
    
    width, height = image.size
    
    # Get background color
    bg_color = get_background_color(image, params['background'])
    
    # Get dominant colors for shape generation
    target_colors = get_dominant_colors(image, 20)
    
    # Create initial canvas
    if params['background'] == 'transparent':
        current = Image.new('RGBA', (width, height), bg_color)
    else:
        current = Image.new('RGB', (width, height), bg_color[:3])
    
    shapes = []
    best_fitness = calculate_fitness(current, image)
    
    print(f"Starting primitive vectorization with {params['shapeCount']} shapes...")
    
    # Generate shapes
    for shape_idx in range(params['shapeCount']):
        if shape_idx % 20 == 0:
            print(f"Processing shape {shape_idx + 1}/{params['shapeCount']}")
        
        # Choose shape type
        if params['shapeType'] == 'mixed':
            shape_type = random.choice(['triangle', 'ellipse', 'rectangle', 'circle'])
        else:
            shape_type = params['shapeType']
        
        best_shape = None
        best_shape_fitness = best_fitness
        
        # Try multiple iterations to find best shape
        for iteration in range(params['iterations']):
            # Create random shape
            if iteration == 0 or best_shape is None:
                test_shape = create_random_shape(shape_type, (width, height), target_colors)
            else:
                # Mutate existing best shape
                test_shape = best_shape.mutate((width, height))
            
            test_shape.alpha = params['alpha']
            
            # Create test image
            if params['background'] == 'transparent':
                test_canvas = Image.new('RGBA', (width, height), bg_color)
            else:
                test_canvas = Image.new('RGB', (width, height), bg_color[:3])
            
            test_draw = ImageDraw.Draw(test_canvas)
            
            # Draw all existing shapes
            for existing_shape in shapes:
                draw_shape(test_draw, existing_shape)
            
            # Draw test shape
            draw_shape(test_draw, test_shape)
            
            # Calculate fitness
            if params['background'] == 'transparent':
                # Convert to RGB for comparison
                test_rgb = Image.new('RGB', (width, height), (255, 255, 255))
                test_rgb.paste(test_canvas, mask=test_canvas.split()[-1] if test_canvas.mode == 'RGBA' else None)
                fitness = calculate_fitness(test_rgb, image)
            else:
                fitness = calculate_fitness(test_canvas, image)
            
            # Keep if better
            if fitness > best_shape_fitness:
                best_shape = test_shape
                best_shape_fitness = fitness
        
        # Add best shape to collection
        if best_shape:
            shapes.append(best_shape)
            best_fitness = best_shape_fitness
    
    # Generate final SVG
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" 
     xmlns="http://www.w3.org/2000/svg">
'''
    
    # Add background if not transparent
    if params['background'] != 'transparent':
        bg_hex = '#{:02x}{:02x}{:02x}'.format(*bg_color[:3])
        svg_content += f'  <rect width="{width}" height="{height}" fill="{bg_hex}"/>\\n'
    
    # Add shapes
    for i, shape in enumerate(shapes):
        color_hex = '#{:02x}{:02x}{:02x}'.format(*shape.color)
        opacity = shape.alpha
        
        if shape.shape_type == 'triangle':
            points = f"{shape.bounds[0]},{shape.bounds[1]} {shape.bounds[2]},{shape.bounds[3]} {shape.bounds[4]},{shape.bounds[5]}"
            svg_content += f'  <polygon points="{points}" fill="{color_hex}" opacity="{opacity}"/>\\n'
        elif shape.shape_type == 'ellipse' or shape.shape_type == 'circle':
            cx = (shape.bounds[0] + shape.bounds[2]) / 2
            cy = (shape.bounds[1] + shape.bounds[3]) / 2
            rx = abs(shape.bounds[2] - shape.bounds[0]) / 2
            ry = abs(shape.bounds[3] - shape.bounds[1]) / 2
            svg_content += f'  <ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{color_hex}" opacity="{opacity}"/>\\n'
        else:  # rectangle
            x, y = shape.bounds[0], shape.bounds[1]
            w = shape.bounds[2] - shape.bounds[0]
            h = shape.bounds[3] - shape.bounds[1]
            svg_content += f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color_hex}" opacity="{opacity}"/>\\n'
    
    svg_content += '</svg>'
    
    # Write SVG file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    
    print(f"STATS:shapes={len(shapes)},iterations_per_shape={params['iterations']}")
    print("Primitive vectorization completed successfully")

def main():
    if len(sys.argv) != 4:
        print("Usage: python primitive_converter.py <input_image> <output_svg> <params_json>")
        sys.exit(1)
    
    input_path = sys.argv[1].strip('"')
    output_path = sys.argv[2].strip('"')
    params_json = sys.argv[3].strip("'")
    
    try:
        params = json.loads(params_json)
        primitive_vectorize(input_path, output_path, params)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

    await writeFile(scriptPath, pythonScript, 'utf8');
    
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
    stdout: string,
    params: ConversionParams
  ): Promise<QualityMetrics> {
    try {
      const outputStats = await statAsync(outputPath);
      
      // Parse statistics from Python script output
      let pathCount = 0;
      let iterations = 0;
      
      const statsMatch = stdout.match(/STATS:shapes=(\d+),iterations_per_shape=(\d+)/);
      if (statsMatch) {
        pathCount = parseInt(statsMatch[1]);
        iterations = parseInt(statsMatch[2]);
      }

      // Artistic quality is different from technical accuracy
      const artisticQuality = this.calculateArtisticQuality(pathCount, params);

      return {
        pathCount,
        pointCount: pathCount * 4, // Approximate points per shape
        fileSize: outputStats.size,
        processingTime,
        accuracy: artisticQuality, // For primitive, this represents artistic faithfulness
        smoothness: 0.6 // Primitive uses geometric shapes, so smoothness is moderate
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

  private calculateArtisticQuality(shapeCount: number, params: ConversionParams): number {
    // Artistic quality based on shape count and parameters
    let quality = 0.6; // Base quality
    
    // More shapes generally mean higher quality
    if (shapeCount >= 100) quality += 0.1;
    if (shapeCount >= 200) quality += 0.1;
    
    // Higher iterations improve quality
    if (params.iterations && params.iterations >= 1000) quality += 0.05;
    if (params.iterations && params.iterations >= 5000) quality += 0.05;
    
    // Mixed shapes provide better representation
    if (params.shapeType === 'mixed') quality += 0.1;
    
    return Math.min(quality, 0.9); // Cap at 0.9 since this is artistic, not technical
  }

  async validateParameters(params: ConversionParams): Promise<string[]> {
    const errors: string[] = [];

    if (params.shapeCount !== undefined) {
      if (params.shapeCount < 10 || params.shapeCount > 500) {
        errors.push('Shape count must be between 10 and 500');
      }
    }

    if (params.iterations !== undefined) {
      if (params.iterations < 100 || params.iterations > 10000) {
        errors.push('Iterations must be between 100 and 10000');
      }
    }

    if (params.alpha !== undefined) {
      if (params.alpha < 0.1 || params.alpha > 1.0) {
        errors.push('Alpha must be between 0.1 and 1.0');
      }
    }

    if (params.resize !== undefined) {
      if (params.resize < 0.1 || params.resize > 2.0) {
        errors.push('Resize factor must be between 0.1 and 2.0');
      }
    }

    return errors;
  }

  estimateTime(fileSize: number, params: ConversionParams): number {
    // Base time: very slow due to iterative nature
    let baseTime = Math.max(5000, fileSize / 1024); // At least 5 seconds
    
    // Adjust for parameters
    const shapeCount = params.shapeCount || 100;
    const iterations = params.iterations || 1000;
    
    // Time scales with shapes and iterations
    baseTime *= (shapeCount / 100) * (iterations / 1000);
    
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
      requirements: available ? [] : ['python3', 'pillow', 'numpy']
    };
  }
}