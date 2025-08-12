import { Router, Request, Response } from 'express';
import path from 'path';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { validateConversionParams } from '../../../shared/utils';
import { getConversionService } from '../services/ConversionServiceSingleton';

const router = Router();

// Create conversion job
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { fileId, method, parameters = {} } = req.body;

  if (!fileId || !method) {
    throw createError('fileId and method are required', 400, 'MISSING_PARAMS');
  }

  // Validate parameters
  const validationErrors = validateConversionParams(parameters, method);
  if (validationErrors.length > 0) {
    throw createError(`Invalid parameters: ${validationErrors.join(', ')}`, 400, 'INVALID_PARAMETERS');
  }

  try {
    const job = await getConversionService().createJob(fileId, method, parameters);
    
    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    if (error instanceof Error) {
      throw createError(error.message, 400, 'CONVERSION_ERROR');
    }
    throw error;
  }
}));

// Get job status
router.get('/:jobId/status', asyncHandler(async (req: Request, res: Response) => {
  const job = await getConversionService().getJob(req.params.jobId);
  
  if (!job) {
    throw createError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  res.json({
    success: true,
    data: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      estimatedTime: job.estimatedTime,
      error: job.error
    }
  });
}));

// Get job result
router.get('/:jobId/result', asyncHandler(async (req: Request, res: Response) => {
  const job = await getConversionService().getJob(req.params.jobId);
  
  if (!job) {
    throw createError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  if (job.status !== 'completed') {
    throw createError('Job not completed', 400, 'JOB_NOT_COMPLETED');
  }

  if (!job.resultPath) {
    throw createError('Result file not found', 404, 'RESULT_NOT_FOUND');
  }

  const absolutePath = path.isAbsolute(job.resultPath) ? job.resultPath : path.resolve(job.resultPath);
  res.download(absolutePath, `converted_${job.id}.svg`);
}));

// Get job details
router.get('/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const job = await getConversionService().getJob(req.params.jobId);
  
  if (!job) {
    throw createError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  res.json({
    success: true,
    data: job
  });
}));

// Cancel job
router.delete('/:jobId', asyncHandler(async (req: Request, res: Response) => {
  await getConversionService().cancelJob(req.params.jobId);
  
  res.json({
    success: true,
    message: 'Job cancelled successfully'
  });
}));

// Get jobs for a file
router.get('/file/:fileId', asyncHandler(async (req: Request, res: Response) => {
  const jobs = await getConversionService().getJobsByFile(req.params.fileId);
  
  res.json({
    success: true,
    data: jobs
  });
}));

// Batch conversion
router.post('/batch', asyncHandler(async (req: Request, res: Response) => {
  const { fileIds, methods, parameters = {} } = req.body;

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    throw createError('fileIds array is required', 400, 'MISSING_FILE_IDS');
  }

  if (!methods || !Array.isArray(methods) || methods.length === 0) {
    throw createError('methods array is required', 400, 'MISSING_METHODS');
  }

  const jobs = [];
  const errors = [];

  try {
    for (const fileId of fileIds) {
      for (const method of methods) {
        try {
          const job = await getConversionService().createJob(fileId, method, parameters);
          jobs.push(job);
        } catch (error) {
          errors.push({
            fileId,
            method,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        jobs,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    throw createError('Batch conversion failed', 500, 'BATCH_CONVERSION_ERROR');
  }
}));

// Get service status
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      activeJobs: getConversionService().getActiveJobsCount(),
      availableConverters: getConversionService().getAvailableConverters()
    }
  });
}));

export default router;