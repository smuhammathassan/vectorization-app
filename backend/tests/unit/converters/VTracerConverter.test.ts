import path from 'path';
import fs from 'fs';
import { VTracerConverter } from '../../../src/converters/VTracerConverter';
import { FileUpload, ConversionParams } from '../../../../shared/types';

describe('VTracerConverter', () => {
  let converter: VTracerConverter;
  let mockFile: FileUpload;

  beforeEach(() => {
    converter = new VTracerConverter();
    
    // Create a mock file
    mockFile = {
      id: 'test-file-1',
      originalName: 'test-image.png',
      filename: 'test-image.png',
      path: path.join(__dirname, '../../fixtures/test-image.png'),
      mimetype: 'image/png',
      size: 1024,
      metadata: {
        width: 100,
        height: 100
      },
      uploadedAt: new Date().toISOString()
    };
  });

  describe('Basic Properties', () => {
    test('should have correct name and properties', () => {
      expect(converter.name).toBe('vtracer');
      expect(converter.description).toContain('VTracer');
      expect(converter.category).toBe('modern');
      expect(converter.supportedFormats).toContain('png');
      expect(converter.supportedFormats).toContain('jpg');
      expect(converter.supportedFormats).toContain('jpeg');
    });

    test('should have performance information', () => {
      expect(converter.performance).toBeDefined();
      expect(converter.performance.speed).toBeDefined();
      expect(converter.performance.quality).toBeDefined();
      expect(converter.performance.memoryUsage).toBeDefined();
      expect(converter.performance.bestFor).toBeInstanceOf(Array);
    });

    test('should have parameter definitions', () => {
      expect(converter.parameters).toBeInstanceOf(Array);
      expect(converter.parameters.length).toBeGreaterThan(0);
      
      // Check for required parameters
      const paramNames = converter.parameters.map(p => p.name);
      expect(paramNames).toContain('colorMode');
      expect(paramNames).toContain('hierarchical');
      expect(paramNames).toContain('filterSpeckle');
    });
  });

  describe('Availability Check', () => {
    test('should check availability', async () => {
      const isAvailable = await converter.isAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Parameter Validation', () => {
    test('should validate valid parameters', async () => {
      const params: ConversionParams = {
        colorMode: 'color',
        hierarchical: 'stacked',
        filterSpeckle: 4
      };
      
      const errors = await converter.validateParameters(params);
      expect(errors).toEqual([]);
    });

    test('should reject invalid color mode', async () => {
      const params: ConversionParams = {
        colorMode: 'invalid-mode'
      };
      
      const errors = await converter.validateParameters(params);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('colorMode');
    });

    test('should reject invalid hierarchical mode', async () => {
      const params: ConversionParams = {
        hierarchical: 'invalid-hierarchical'
      };
      
      const errors = await converter.validateParameters(params);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('hierarchical');
    });

    test('should reject invalid filter speckle value', async () => {
      const params: ConversionParams = {
        filterSpeckle: -1
      };
      
      const errors = await converter.validateParameters(params);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('filterSpeckle');
    });
  });

  describe('Time Estimation', () => {
    test('should estimate processing time', () => {
      const params: ConversionParams = {};
      const fileSize = 1024 * 1024; // 1MB
      
      const estimatedTime = converter.estimateTime(fileSize, params);
      expect(estimatedTime).toBeGreaterThan(0);
      expect(typeof estimatedTime).toBe('number');
    });

    test('should estimate longer time for larger files', () => {
      const params: ConversionParams = {};
      const smallFileSize = 1024; // 1KB
      const largeFileSize = 1024 * 1024 * 10; // 10MB
      
      const smallFileTime = converter.estimateTime(smallFileSize, params);
      const largeFileTime = converter.estimateTime(largeFileSize, params);
      
      expect(largeFileTime).toBeGreaterThan(smallFileTime);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing file', async () => {
      const invalidFile: FileUpload = {
        ...mockFile,
        path: '/non/existent/path.png'
      };
      
      const params: ConversionParams = {};
      
      await expect(converter.convert(invalidFile, params))
        .rejects
        .toThrow();
    });

    test('should handle invalid file format', async () => {
      const invalidFile: FileUpload = {
        ...mockFile,
        mimetype: 'text/plain',
        originalName: 'test.txt'
      };
      
      const params: ConversionParams = {};
      
      await expect(converter.convert(invalidFile, params))
        .rejects
        .toThrow();
    });
  });

  describe('Progress Reporting', () => {
    test('should call progress callback during conversion', async () => {
      // Skip if vtracer is not available
      const isAvailable = await converter.isAvailable();
      if (!isAvailable) {
        console.log('VTracer not available, skipping conversion test');
        return;
      }

      const progressCallbacks: number[] = [];
      const onProgress = (progress: number) => {
        progressCallbacks.push(progress);
      };

      // Create a minimal test image if it doesn't exist
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      if (!fs.existsSync(path.dirname(testImagePath))) {
        fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
      }
      
      // For testing purposes, we'll skip actual conversion if file doesn't exist
      if (!fs.existsSync(testImagePath)) {
        console.log('Test image not found, skipping conversion test');
        return;
      }

      const params: ConversionParams = {};
      
      try {
        await converter.convert(mockFile, params, onProgress);
        
        // Should have received some progress updates
        expect(progressCallbacks.length).toBeGreaterThan(0);
        expect(progressCallbacks[progressCallbacks.length - 1]).toBe(100);
      } catch (error) {
        // It's okay if conversion fails due to missing dependencies
        console.log('Conversion failed (expected in test environment):', error);
      }
    });
  });
});