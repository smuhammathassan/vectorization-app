import { VTracerConverter } from '../../../src/converters/VTracerConverter';
import { PotraceConverter } from '../../../src/converters/PotraceConverter';
import { OpenCVConverter } from '../../../src/converters/OpenCVConverter';
import { InkscapeConverter } from '../../../src/converters/InkscapeConverter';
import { AutoTraceConverter } from '../../../src/converters/AutoTraceConverter';
import { PrimitiveConverter } from '../../../src/converters/PrimitiveConverter';
import { SVGCleanerConverter } from '../../../src/converters/SVGCleanerConverter';
import { IConverter } from '../../../src/converters/IConverter';

describe('Converter Interface Compliance', () => {
  const converters: IConverter[] = [
    new VTracerConverter(),
    new PotraceConverter(),
    new OpenCVConverter(),
    new InkscapeConverter(),
    new AutoTraceConverter(),
    new PrimitiveConverter(),
    new SVGCleanerConverter(),
  ];

  describe('Interface Implementation', () => {
    converters.forEach((converter) => {
      describe(`${converter.name} converter`, () => {
        test('should implement all required properties', () => {
          expect(converter.name).toBeDefined();
          expect(typeof converter.name).toBe('string');
          expect(converter.name.length).toBeGreaterThan(0);
          
          expect(converter.description).toBeDefined();
          expect(typeof converter.description).toBe('string');
          expect(converter.description.length).toBeGreaterThan(0);
          
          expect(converter.category).toBeDefined();
          expect(['traditional', 'modern', 'ai', 'external']).toContain(converter.category);
          
          expect(converter.supportedFormats).toBeDefined();
          expect(Array.isArray(converter.supportedFormats)).toBe(true);
          expect(converter.supportedFormats.length).toBeGreaterThan(0);
          
          expect(converter.parameters).toBeDefined();
          expect(Array.isArray(converter.parameters)).toBe(true);
          
          expect(converter.performance).toBeDefined();
          expect(converter.performance.speed).toBeDefined();
          expect(converter.performance.quality).toBeDefined();
          expect(converter.performance.memoryUsage).toBeDefined();
          expect(Array.isArray(converter.performance.bestFor)).toBe(true);
        });

        test('should implement all required methods', () => {
          expect(typeof converter.isAvailable).toBe('function');
          expect(typeof converter.validateParameters).toBe('function');
          expect(typeof converter.convert).toBe('function');
          expect(typeof converter.estimateTime).toBe('function');
        });

        test('should have valid parameter definitions', () => {
          converter.parameters.forEach((param) => {
            expect(param.name).toBeDefined();
            expect(typeof param.name).toBe('string');
            expect(param.name.length).toBeGreaterThan(0);
            
            expect(param.type).toBeDefined();
            expect(['string', 'number', 'boolean', 'select']).toContain(param.type);
            
            expect(param.label).toBeDefined();
            expect(typeof param.label).toBe('string');
            
            expect(param.description).toBeDefined();
            expect(typeof param.description).toBe('string');
            
            expect(param.default).toBeDefined();
            
            if (param.type === 'select') {
              expect(param.options).toBeDefined();
              expect(Array.isArray(param.options)).toBe(true);
              expect(param.options!.length).toBeGreaterThan(0);
            }
            
            if (param.type === 'number') {
              if (param.min !== undefined) {
                expect(typeof param.min).toBe('number');
              }
              if (param.max !== undefined) {
                expect(typeof param.max).toBe('number');
              }
              if (param.step !== undefined) {
                expect(typeof param.step).toBe('number');
              }
            }
          });
        });

        test('should have unique parameter names', () => {
          const paramNames = converter.parameters.map(p => p.name);
          const uniqueNames = [...new Set(paramNames)];
          expect(paramNames.length).toBe(uniqueNames.length);
        });

        test('should support common image formats', () => {
          const commonFormats = ['png', 'jpg', 'jpeg'];
          const hasCommonFormat = commonFormats.some(format => 
            converter.supportedFormats.includes(format)
          );
          expect(hasCommonFormat).toBe(true);
        });

        test('isAvailable should return boolean', async () => {
          const result = await converter.isAvailable();
          expect(typeof result).toBe('boolean');
        });

        test('validateParameters should return array', async () => {
          const result = await converter.validateParameters({});
          expect(Array.isArray(result)).toBe(true);
        });

        test('validateParameters should return empty array for valid empty params', async () => {
          const result = await converter.validateParameters({});
          expect(result).toEqual([]);
        });

        test('estimateTime should return positive number', () => {
          const result = converter.estimateTime(1024, {});
          expect(typeof result).toBe('number');
          expect(result).toBeGreaterThan(0);
        });

        test('estimateTime should scale with file size', () => {
          const smallTime = converter.estimateTime(1024, {});
          const largeTime = converter.estimateTime(1024 * 1024, {});
          expect(largeTime).toBeGreaterThanOrEqual(smallTime);
        });
      });
    });
  });

  describe('Converter Uniqueness', () => {
    test('should have unique converter names', () => {
      const names = converters.map(c => c.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });

    test('should have different descriptions', () => {
      const descriptions = converters.map(c => c.description);
      const uniqueDescriptions = [...new Set(descriptions)];
      expect(descriptions.length).toBe(uniqueDescriptions.length);
    });
  });

  describe('Category Distribution', () => {
    test('should have converters in multiple categories', () => {
      const categories = [...new Set(converters.map(c => c.category))];
      expect(categories.length).toBeGreaterThan(1);
    });

    test('should categorize converters appropriately', () => {
      const traditionalConverters = converters.filter(c => c.category === 'traditional');
      const modernConverters = converters.filter(c => c.category === 'modern');
      
      expect(traditionalConverters.length).toBeGreaterThan(0);
      expect(modernConverters.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Information', () => {
    test('should have valid performance levels', () => {
      const validLevels = ['slow', 'medium', 'fast', 'very-fast'];
      
      converters.forEach(converter => {
        expect(validLevels).toContain(converter.performance.speed);
        expect(validLevels).toContain(converter.performance.quality);
        expect(validLevels).toContain(converter.performance.memoryUsage);
      });
    });

    test('should have meaningful best-for descriptions', () => {
      converters.forEach(converter => {
        expect(converter.performance.bestFor.length).toBeGreaterThan(0);
        converter.performance.bestFor.forEach(use => {
          expect(typeof use).toBe('string');
          expect(use.length).toBeGreaterThan(0);
        });
      });
    });
  });
});