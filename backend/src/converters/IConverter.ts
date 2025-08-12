import { 
  FileUpload, 
  ConversionParams, 
  ConversionResult,
  ParameterDefinition,
  PerformanceInfo
} from '../../../shared/types';

export interface IConverter {
  name: string;
  description: string;
  category: 'traditional' | 'modern' | 'ai' | 'external';
  supportedFormats: string[];
  parameters: ParameterDefinition[];
  performance: PerformanceInfo;
  requirements?: string[];

  /**
   * Check if the converter is available and ready to use
   */
  isAvailable(): Promise<boolean>;

  /**
   * Validate conversion parameters
   */
  validateParameters(params: ConversionParams): Promise<string[]>;

  /**
   * Perform the conversion
   */
  convert(
    file: FileUpload, 
    params: ConversionParams, 
    onProgress?: (progress: number) => void
  ): Promise<ConversionResult>;

  /**
   * Get estimated processing time in milliseconds
   */
  estimateTime(fileSize: number, params: ConversionParams): number;

  /**
   * Clean up any temporary files or resources
   */
  cleanup?(): Promise<void>;
}