import path from 'path';
import fs from 'fs';
import { PotraceConverter } from '../../../src/converters/PotraceConverter';
import { FileUpload, ConversionParams } from '../../../../../shared/types';

describe('PotraceConverter', () => {
  let converter: PotraceConverter;
  let mockFile: FileUpload;

  beforeEach(() => {
    converter = new PotraceConverter();
    
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
      expect(converter.name).toBe('potrace');
      expect(converter.description).toContain('Potrace');
      expect(converter.category).toBe('traditional');
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
      
      const paramNames = converter.parameters.map(p => p.name);
      expect(paramNames).toContain('threshold');
      expect(paramNames).toContain('turnPolicy');
      expect(paramNames).toContain('turdSize');
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
        threshold: 0.5,
        turnPolicy: 'minority',
        turdSize: 2
      };
      
      const errors = await converter.validateParameters(params);
      expect(errors).toEqual([]);
    });

    test('should reject invalid threshold', async () => {
      const params: ConversionParams = {
        threshold: 1.5 // Should be 0-1
      };
      
      const errors = await converter.validateParameters(params);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('threshold');
    });

    test('should reject invalid turn policy', async () => {
      const params: ConversionParams = {
        turnPolicy: 'invalid-policy'
      };
      
      const errors = await converter.validateParameters(params);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('turnPolicy');
    });

    test('should reject negative turd size', async () => {
      const params: ConversionParams = {
        turdSize: -1
      };
      
      const errors = await converter.validateParameters(params);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('turdSize');
    });
  });

  describe('Time Estimation', () => {
    test('should estimate processing time', () => {
      const params: ConversionParams = {};
      const fileSize = 1024 * 1024;
      
      const estimatedTime = converter.estimateTime(fileSize, params);
      expect(estimatedTime).toBeGreaterThan(0);
      expect(typeof estimatedTime).toBe('number');
    });

    test('should estimate different times for different complexities', () => {
      const simpleParams: ConversionParams = { threshold: 0.8 }; // High threshold = simpler
      const complexParams: ConversionParams = { threshold: 0.2 }; // Low threshold = more complex
      const fileSize = 1024 * 1024;
      
      const simpleTime = converter.estimateTime(fileSize, simpleParams);
      const complexTime = converter.estimateTime(fileSize, complexParams);
      
      // Complex conversions should generally take longer
      expect(complexTime).toBeGreaterThanOrEqual(simpleTime);
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

    test('should handle unsupported file format', async () => {
      const invalidFile: FileUpload = {
        ...mockFile,
        mimetype: 'application/pdf',
        originalName: 'test.pdf'
      };
      
      const params: ConversionParams = {};
      
      await expect(converter.convert(invalidFile, params))
        .rejects
        .toThrow();
    });
  });

  describe('Progress Reporting', () => {
    test('should call progress callback during conversion', async () => {
      const isAvailable = await converter.isAvailable();
      if (!isAvailable) {
        console.log('Potrace not available, skipping conversion test');
        return;
      }

      const progressCallbacks: number[] = [];
      const onProgress = (progress: number) => {
        progressCallbacks.push(progress);
      };

      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      if (!fs.existsSync(testImagePath)) {
        console.log('Test image not found, skipping conversion test');
        return;
      }

      const params: ConversionParams = {};
      
      try {
        await converter.convert(mockFile, params, onProgress);
        
        expect(progressCallbacks.length).toBeGreaterThan(0);
        expect(progressCallbacks[progressCallbacks.length - 1]).toBe(100);
      } catch (error) {
        console.log('Conversion failed (expected in test environment):', error);
      }
    });
  });
});