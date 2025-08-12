import { ConversionService } from './ConversionService';
import { VTracerConverter } from '../converters/VTracerConverter';
import { OpenCVConverter } from '../converters/OpenCVConverter';
import { PotraceConverter } from '../converters/PotraceConverter';
import { InkscapeConverter } from '../converters/InkscapeConverter';

// Singleton instance
let conversionServiceInstance: ConversionService | null = null;

export function getConversionService(): ConversionService {
  if (!conversionServiceInstance) {
    conversionServiceInstance = new ConversionService();
    conversionServiceInstance.registerConverter(new VTracerConverter());
    conversionServiceInstance.registerConverter(new OpenCVConverter());
    conversionServiceInstance.registerConverter(new PotraceConverter());
    conversionServiceInstance.registerConverter(new InkscapeConverter());
    console.log('Conversion service singleton initialized with all converters available');
  }
  return conversionServiceInstance;
}