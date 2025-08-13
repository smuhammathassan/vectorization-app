import { ConversionService } from './ConversionService';
import { VTracerConverter } from '../converters/VTracerConverter';
import { OpenCVConverter } from '../converters/OpenCVConverter';
import { PotraceConverter } from '../converters/PotraceConverter';
import { InkscapeConverter } from '../converters/InkscapeConverter';
import { AutoTraceConverter } from '../converters/AutoTraceConverter';
import { PrimitiveConverter } from '../converters/PrimitiveConverter';
import { SVGCleanerConverter } from '../converters/SVGCleanerConverter';

// Singleton instance
let conversionServiceInstance: ConversionService | null = null;

export function getConversionService(): ConversionService {
  if (!conversionServiceInstance) {
    conversionServiceInstance = new ConversionService();
    // Register existing converters
    conversionServiceInstance.registerConverter(new VTracerConverter());
    conversionServiceInstance.registerConverter(new OpenCVConverter());
    conversionServiceInstance.registerConverter(new PotraceConverter());
    conversionServiceInstance.registerConverter(new InkscapeConverter());
    // Register new converters
    conversionServiceInstance.registerConverter(new AutoTraceConverter());
    conversionServiceInstance.registerConverter(new PrimitiveConverter());
    conversionServiceInstance.registerConverter(new SVGCleanerConverter());
    console.log('Conversion service singleton initialized with all converters available');
  }
  return conversionServiceInstance;
}