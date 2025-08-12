import { EventEmitter } from 'events';
import { getDatabase } from '../config/database';
import { 
  ConversionJob, 
  ConversionParams, 
  ConversionResult, 
  JobStatus,
  QualityMetrics 
} from '../../../shared/types';
import { generateId, estimateProcessingTime } from '../../../shared/utils';
import { IConverter } from '../converters/IConverter';
import { FileService } from './FileService';

export class ConversionService extends EventEmitter {
  private db = getDatabase();
  private fileService = new FileService();
  private converters = new Map<string, IConverter>();
  private activeJobs = new Map<string, ConversionJob>();

  constructor() {
    super();
  }

  registerConverter(converter: IConverter): void {
    this.converters.set(converter.name, converter);
    console.log(`Registered converter: ${converter.name}`);
  }

  async createJob(
    fileId: string, 
    method: string, 
    parameters: ConversionParams = {}
  ): Promise<ConversionJob> {
    // Verify file exists
    const file = await this.fileService.getFile(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    // Verify converter exists and is available
    const converter = this.converters.get(method);
    if (!converter) {
      throw new Error(`Converter ${method} not found`);
    }

    const isAvailable = await converter.isAvailable();
    if (!isAvailable) {
      const requirements = converter.requirements || ['Unknown requirements'];
      throw new Error(`Converter "${method}" is not available. Please install: ${requirements.join(', ')}`);
    }

    // Validate parameters
    const validationErrors = await converter.validateParameters(parameters);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid parameters: ${validationErrors.join(', ')}`);
    }

    const job: ConversionJob = {
      id: generateId(),
      fileId,
      method,
      status: 'pending',
      progress: 0,
      parameters,
      createdAt: new Date(),
      estimatedTime: estimateProcessingTime(file.size, method)
    };

    // Save job to database
    await this.saveJob(job);
    
    // Queue for processing
    this.queueJob(job);

    return job;
  }

  private async saveJob(job: ConversionJob): Promise<void> {
    const query = `
      INSERT INTO jobs (
        id, file_id, method, status, progress, parameters, 
        created_at, estimated_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(
        query,
        [
          job.id,
          job.fileId,
          job.method,
          job.status,
          job.progress,
          JSON.stringify(job.parameters),
          job.createdAt.toISOString(),
          job.estimatedTime
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  private async updateJob(job: ConversionJob): Promise<void> {
    const query = `
      UPDATE jobs SET 
        status = ?, progress = ?, started_at = ?, completed_at = ?,
        error = ?, result_path = ?, quality_metrics = ?
      WHERE id = ?
    `;

    return new Promise((resolve, reject) => {
      this.db.run(
        query,
        [
          job.status,
          job.progress,
          job.startedAt?.toISOString(),
          job.completedAt?.toISOString(),
          job.error,
          job.resultPath,
          job.qualityMetrics ? JSON.stringify(job.qualityMetrics) : null,
          job.id
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async getJob(jobId: string): Promise<ConversionJob | null> {
    const query = `
      SELECT 
        id, file_id, method, status, progress, parameters,
        created_at, started_at, completed_at, error, 
        estimated_time, result_path, quality_metrics
      FROM jobs 
      WHERE id = ?
    `;

    return new Promise((resolve, reject) => {
      this.db.get(query, [jobId], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            id: row.id,
            fileId: row.file_id,
            method: row.method,
            status: row.status as JobStatus,
            progress: row.progress,
            parameters: JSON.parse(row.parameters || '{}'),
            createdAt: new Date(row.created_at),
            startedAt: row.started_at ? new Date(row.started_at) : undefined,
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
            error: row.error,
            estimatedTime: row.estimated_time,
            resultPath: row.result_path,
            qualityMetrics: row.quality_metrics ? JSON.parse(row.quality_metrics) : undefined
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async getJobsByFile(fileId: string): Promise<ConversionJob[]> {
    const query = `
      SELECT 
        id, file_id, method, status, progress, parameters,
        created_at, started_at, completed_at, error, 
        estimated_time, result_path, quality_metrics
      FROM jobs 
      WHERE file_id = ?
      ORDER BY created_at DESC
    `;

    return new Promise((resolve, reject) => {
      this.db.all(query, [fileId], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const jobs = rows.map(row => ({
            id: row.id,
            fileId: row.file_id,
            method: row.method,
            status: row.status as JobStatus,
            progress: row.progress,
            parameters: JSON.parse(row.parameters || '{}'),
            createdAt: new Date(row.created_at),
            startedAt: row.started_at ? new Date(row.started_at) : undefined,
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
            error: row.error,
            estimatedTime: row.estimated_time,
            resultPath: row.result_path,
            qualityMetrics: row.quality_metrics ? JSON.parse(row.quality_metrics) : undefined
          }));
          resolve(jobs);
        }
      });
    });
  }

  private async queueJob(job: ConversionJob): Promise<void> {
    this.activeJobs.set(job.id, job);
    
    // Process immediately (in production, you might want a proper job queue)
    setImmediate(() => this.processJob(job.id));
  }

  private async processJob(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      console.error(`Job ${jobId} not found in active jobs`);
      return;
    }

    try {
      // Update job status
      job.status = 'processing';
      job.startedAt = new Date();
      job.progress = 0;
      await this.updateJob(job);
      this.emit('jobUpdated', job);

      // Get file and converter
      const file = await this.fileService.getFile(job.fileId);
      if (!file) {
        throw new Error('File not found');
      }

      const converter = this.converters.get(job.method);
      if (!converter) {
        throw new Error(`Converter ${job.method} not found`);
      }

      // Progress callback
      const onProgress = (progress: number) => {
        job.progress = Math.min(100, Math.max(0, progress));
        this.updateJob(job);
        this.emit('jobProgress', job);
      };

      // Perform conversion
      const result = await converter.convert(file, job.parameters, onProgress);

      if (result.success && result.outputPath) {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = new Date();
        job.resultPath = result.outputPath;
        job.qualityMetrics = result.qualityMetrics;
      } else {
        job.status = 'failed';
        job.error = result.error || 'Conversion failed';
      }

    } catch (error) {
      console.error(`Conversion job ${jobId} failed:`, error);
      job.status = 'failed';
      
      // Provide more user-friendly error messages
      let errorMessage = 'Unknown error occurred during conversion';
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('command not found')) {
          errorMessage = `Conversion tool not installed. ${error.message}`;
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Conversion timed out. Try reducing image size or complexity.';
        } else if (error.message.includes('permission')) {
          errorMessage = 'Permission denied. Check file permissions.';
        } else if (error.message.includes('no such file')) {
          errorMessage = 'Input file not found or inaccessible.';
        } else {
          errorMessage = error.message;
        }
      }
      job.error = errorMessage;
    }

    // Final update
    job.completedAt = new Date();
    await this.updateJob(job);
    this.emit('jobCompleted', job);
    
    // Remove from active jobs
    this.activeJobs.delete(jobId);
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === 'processing') {
      job.status = 'cancelled';
      job.completedAt = new Date();
      await this.updateJob(job);
      this.emit('jobCancelled', job);
    }
    
    this.activeJobs.delete(jobId);
  }

  getActiveJobsCount(): number {
    return this.activeJobs.size;
  }

  getAvailableConverters(): string[] {
    return Array.from(this.converters.keys());
  }

  async getConverterInfo(method: string) {
    const converter = this.converters.get(method);
    if (!converter) {
      return null;
    }

    return {
      name: converter.name,
      description: converter.description,
      category: converter.category,
      supportedFormats: converter.supportedFormats,
      parameters: converter.parameters,
      performance: converter.performance,
      available: await converter.isAvailable(),
      requirements: converter.requirements
    };
  }

  async getAllConvertersInfo() {
    const converters = [];
    for (const [name, converter] of this.converters) {
      converters.push(await this.getConverterInfo(name));
    }
    return converters;
  }
}