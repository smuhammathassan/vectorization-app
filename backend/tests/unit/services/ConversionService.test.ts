import { ConversionService } from '../../../src/services/ConversionService';
import { IConverter } from '../../../src/converters/IConverter';
import { FileUpload, ConversionParams, ConversionResult } from '../../../../../shared/types';

// Mock converter for testing
class MockConverter implements IConverter {
  name = 'mock-converter';
  description = 'Mock converter for testing';
  category = 'traditional' as const;
  supportedFormats = ['png', 'jpg'];
  parameters = [
    {
      name: 'quality',
      type: 'number' as const,
      label: 'Quality',
      description: 'Output quality',
      default: 80,
      min: 1,
      max: 100
    }
  ];
  performance = {
    speed: 'fast' as const,
    quality: 'medium' as const,
    memoryUsage: 'low' as const,
    bestFor: ['testing']
  };

  private shouldFail = false;
  private shouldBeUnavailable = false;

  setShouldFail(fail: boolean) {
    this.shouldFail = fail;
  }

  setShouldBeUnavailable(unavailable: boolean) {
    this.shouldBeUnavailable = unavailable;
  }

  async isAvailable(): Promise<boolean> {
    return !this.shouldBeUnavailable;
  }

  async validateParameters(params: ConversionParams): Promise<string[]> {
    const errors: string[] = [];
    if (params.quality && (params.quality < 1 || params.quality > 100)) {
      errors.push('Quality must be between 1 and 100');
    }
    return errors;
  }

  async convert(
    file: FileUpload, 
    params: ConversionParams, 
    onProgress?: (progress: number) => void
  ): Promise<ConversionResult> {
    if (this.shouldFail) {
      throw new Error('Mock conversion failed');
    }

    // Simulate progress updates
    if (onProgress) {
      onProgress(25);
      onProgress(50);
      onProgress(75);
      onProgress(100);
    }

    return {
      success: true,
      outputPath: '/mock/output/path.svg',
      metadata: {
        pathCount: 10,
        outputSize: 2048,
        processingTime: 1000
      }
    };
  }

  estimateTime(fileSize: number, params: ConversionParams): number {
    return Math.max(1000, fileSize / 1024); // 1 second minimum, 1ms per KB
  }
}

// Mock the database
jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(),
    prepare: jest.fn(() => ({
      run: jest.fn(),
      finalize: jest.fn()
    }))
  }))
}));

describe('ConversionService', () => {
  let conversionService: ConversionService;
  let mockConverter: MockConverter;
  let mockDb: any;

  beforeEach(() => {
    mockConverter = new MockConverter();
    conversionService = new ConversionService();
    conversionService.registerConverter(mockConverter);

    // Get the mocked database
    const { getDatabase } = require('../../../src/config/database');
    mockDb = getDatabase();
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Converter Registration', () => {
    test('should register converter', () => {
      const newConverter = new MockConverter();
      newConverter.name = 'new-converter';
      
      conversionService.registerConverter(newConverter);
      const methods = conversionService.getAvailableMethods();
      
      expect(methods.some(m => m.name === 'new-converter')).toBe(true);
    });

    test('should not register duplicate converter names', () => {
      const duplicateConverter = new MockConverter();
      
      expect(() => {
        conversionService.registerConverter(duplicateConverter);
      }).toThrow('Converter with name mock-converter already registered');
    });

    test('should get available methods', () => {
      const methods = conversionService.getAvailableMethods();
      
      expect(methods).toHaveLength(1);
      expect(methods[0].name).toBe('mock-converter');
      expect(methods[0].available).toBe(true);
    });

    test('should mark unavailable converters', async () => {
      mockConverter.setShouldBeUnavailable(true);
      
      const methods = await conversionService.getAvailableMethodsWithStatus();
      
      expect(methods[0].available).toBe(false);
    });
  });

  describe('Job Management', () => {
    const mockFile: FileUpload = {
      id: 'test-file-1',
      originalName: 'test.png',
      filename: 'test-123.png',
      path: '/uploads/test-123.png',
      mimetype: 'image/png',
      size: 1024,
      metadata: { width: 100, height: 100 },
      uploadedAt: new Date().toISOString()
    };

    test('should start conversion job', async () => {
      const params: ConversionParams = { quality: 80 };
      
      // Mock database insertion
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const jobId = await conversionService.startConversion(
        'test-file-1',
        mockFile,
        'mock-converter',
        params
      );

      expect(typeof jobId).toBe('string');
      expect(jobId.length).toBeGreaterThan(0);
      expect(mockDb.run).toHaveBeenCalled();
    });

    test('should reject conversion with unknown converter', async () => {
      const params: ConversionParams = {};
      
      await expect(
        conversionService.startConversion(
          'test-file-1',
          mockFile,
          'unknown-converter',
          params
        )
      ).rejects.toThrow('Converter unknown-converter not found');
    });

    test('should reject conversion with invalid parameters', async () => {
      const params: ConversionParams = { quality: 150 }; // Invalid quality
      
      await expect(
        conversionService.startConversion(
          'test-file-1',
          mockFile,
          'mock-converter',
          params
        )
      ).rejects.toThrow('Quality must be between 1 and 100');
    });

    test('should get job status', async () => {
      const jobId = 'test-job-1';
      const mockJobData = {
        id: jobId,
        file_id: 'test-file-1',
        method: 'mock-converter',
        status: 'processing',
        progress: 50,
        parameters: '{"quality":80}',
        created_at: new Date().toISOString(),
        estimated_time: 5000
      };

      mockDb.get.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null, mockJobData);
      });

      const status = await conversionService.getJobStatus(jobId);

      expect(status).toBeDefined();
      expect(status.id).toBe(jobId);
      expect(status.status).toBe('processing');
      expect(status.progress).toBe(50);
    });

    test('should return null for non-existent job', async () => {
      const jobId = 'non-existent-job';

      mockDb.get.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null, undefined);
      });

      const status = await conversionService.getJobStatus(jobId);

      expect(status).toBeNull();
    });

    test('should cancel job', async () => {
      const jobId = 'test-job-1';

      // Mock successful database update
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      await expect(conversionService.cancelJob(jobId)).resolves.toBeUndefined();

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE conversion_jobs SET status = ?'),
        ['failed', jobId],
        expect.any(Function)
      );
    });
  });

  describe('Conversion Execution', () => {
    const mockFile: FileUpload = {
      id: 'test-file-1',
      originalName: 'test.png',
      filename: 'test-123.png',
      path: '/uploads/test-123.png',
      mimetype: 'image/png',
      size: 1024,
      metadata: { width: 100, height: 100 },
      uploadedAt: new Date().toISOString()
    };

    test('should process job successfully', async () => {
      const jobId = 'test-job-1';
      const params: ConversionParams = { quality: 80 };

      // Mock database calls
      let updateCallCount = 0;
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        updateCallCount++;
        callback(null);
      });

      const mockProgressCallback = jest.fn();
      
      const result = await conversionService.processJob(
        jobId,
        mockFile,
        'mock-converter',
        params,
        mockProgressCallback
      );

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/mock/output/path.svg');
      expect(mockProgressCallback).toHaveBeenCalledWith(25);
      expect(mockProgressCallback).toHaveBeenCalledWith(50);
      expect(mockProgressCallback).toHaveBeenCalledWith(75);
      expect(mockProgressCallback).toHaveBeenCalledWith(100);
      expect(updateCallCount).toBeGreaterThan(0); // Should update progress and final status
    });

    test('should handle conversion failure', async () => {
      const jobId = 'test-job-1';
      const params: ConversionParams = {};
      
      mockConverter.setShouldFail(true);

      // Mock database calls
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      await expect(
        conversionService.processJob(
          jobId,
          mockFile,
          'mock-converter',
          params
        )
      ).rejects.toThrow('Mock conversion failed');

      // Should have updated job status to failed
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE conversion_jobs SET status = ?'),
        expect.arrayContaining(['failed']),
        expect.any(Function)
      );
    });

    test('should estimate conversion time', () => {
      const fileSize = 1024 * 1024; // 1MB
      const params: ConversionParams = {};
      
      const estimatedTime = conversionService.estimateConversionTime(
        'mock-converter',
        fileSize,
        params
      );

      expect(estimatedTime).toBeGreaterThan(1000);
      expect(typeof estimatedTime).toBe('number');
    });

    test('should throw error for unknown converter estimation', () => {
      expect(() => {
        conversionService.estimateConversionTime(
          'unknown-converter',
          1024,
          {}
        );
      }).toThrow('Converter unknown-converter not found');
    });
  });

  describe('Job Queries', () => {
    test('should get jobs for file', async () => {
      const fileId = 'test-file-1';
      const mockJobs = [
        {
          id: 'job-1',
          file_id: fileId,
          method: 'mock-converter',
          status: 'completed',
          progress: 100,
          parameters: '{}',
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          estimated_time: 2000
        }
      ];

      mockDb.all.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null, mockJobs);
      });

      const jobs = await conversionService.getJobsForFile(fileId);

      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe('job-1');
      expect(jobs[0].fileId).toBe(fileId);
    });

    test('should get all jobs', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          file_id: 'file-1',
          method: 'mock-converter',
          status: 'completed',
          progress: 100,
          parameters: '{}',
          created_at: new Date().toISOString()
        },
        {
          id: 'job-2',
          file_id: 'file-2',
          method: 'mock-converter',
          status: 'processing',
          progress: 50,
          parameters: '{}',
          created_at: new Date().toISOString()
        }
      ];

      mockDb.all.mockImplementation((query: string, callback: Function) => {
        callback(null, mockJobs);
      });

      const jobs = await conversionService.getAllJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].status).toBe('completed');
      expect(jobs[1].status).toBe('processing');
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(dbError);
      });

      const mockFile: FileUpload = {
        id: 'test-file-1',
        originalName: 'test.png',
        filename: 'test-123.png',
        path: '/uploads/test-123.png',
        mimetype: 'image/png',
        size: 1024,
        metadata: { width: 100, height: 100 },
        uploadedAt: new Date().toISOString()
      };

      await expect(
        conversionService.startConversion(
          'test-file-1',
          mockFile,
          'mock-converter',
          {}
        )
      ).rejects.toThrow('Database connection failed');
    });

    test('should handle unavailable converter', async () => {
      mockConverter.setShouldBeUnavailable(true);
      
      const mockFile: FileUpload = {
        id: 'test-file-1',
        originalName: 'test.png',
        filename: 'test-123.png',
        path: '/uploads/test-123.png',
        mimetype: 'image/png',
        size: 1024,
        metadata: { width: 100, height: 100 },
        uploadedAt: new Date().toISOString()
      };

      await expect(
        conversionService.startConversion(
          'test-file-1',
          mockFile,
          'mock-converter',
          {}
        )
      ).rejects.toThrow('Converter mock-converter is not available');
    });
  });
});