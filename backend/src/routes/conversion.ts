import { Router, Request, Response } from 'express';
import path from 'path';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { validateConversionParams } from '../../../shared/utils';
import { getConversionService } from '../services/ConversionServiceSingleton';
import { paginationMiddleware, createPaginatedResponse } from '../utils/pagination';
import { resourceETagMiddleware, generateStrongETag } from '../middleware/etag';
import { conversionIdempotencyMiddleware } from '../middleware/idempotency';

const router = Router();

// Create conversion job
router.post('/', conversionIdempotencyMiddleware, asyncHandler(async (req: Request, res: Response) => {
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
    
    // Set Location header pointing to the job status endpoint
    const statusUrl = `${req.protocol}://${req.get('host')}/api/convert/${job.id}/status`;
    res.set('Location', statusUrl);
    
    // Return 202 Accepted for async operation
    res.status(202).json({
      success: true,
      message: 'Conversion job created and queued for processing',
      data: {
        id: job.id,
        status: job.status,
        statusUrl: statusUrl,
        estimatedTime: job.estimatedTime
      },
      requestId: req.requestId
    });
  } catch (error) {
    if (error instanceof Error) {
      throw createError(error.message, 400, 'CONVERSION_ERROR');
    }
    throw error;
  }
}));

// Get job status with ETag support
router.get('/:jobId/status',
  resourceETagMiddleware(async (req) => {
    const job = await getConversionService().getJob(req.params.jobId);
    if (!job) return null;
    
    // Generate ETag based on job ID, status, and progress
    const etagData = `${job.id}-${job.status}-${job.progress}`;
    const etag = generateStrongETag(etagData, job.startedAt?.getTime().toString());
    return {
      etag,
      lastModified: job.startedAt || job.createdAt
    };
  }),
  asyncHandler(async (req: Request, res: Response) => {
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
      },
      requestId: req.requestId
    });
  })
);

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
    data: job,
    requestId: req.requestId
  });
}));

// Cancel job
router.delete('/:jobId', asyncHandler(async (req: Request, res: Response) => {
  await getConversionService().cancelJob(req.params.jobId);
  
  res.json({
    success: true,
    message: 'Job cancelled successfully',
    requestId: req.requestId
  });
}));

// Get jobs for a file
router.get('/file/:fileId', asyncHandler(async (req: Request, res: Response) => {
  const jobs = await getConversionService().getJobsByFile(req.params.fileId);
  
  res.json({
    success: true,
    data: jobs,
    requestId: req.requestId
  });
}));

// Batch conversion
router.post('/batch', conversionIdempotencyMiddleware, asyncHandler(async (req: Request, res: Response) => {
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

    // Return 202 Accepted for batch async operations
    res.status(202).json({
      success: true,
      message: `${jobs.length} conversion jobs created and queued for processing`,
      data: {
        jobs: jobs.map(job => ({
          id: job.id,
          status: job.status,
          statusUrl: `${req.protocol}://${req.get('host')}/api/convert/${job.id}/status`,
          estimatedTime: job.estimatedTime
        })),
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          totalRequested: fileIds.length * methods.length,
          jobsCreated: jobs.length,
          errors: errors.length
        }
      },
      requestId: req.requestId
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
    },
    requestId: req.requestId
  });
}));

// List all jobs with pagination
router.get('/', paginationMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // For now, use the existing getAllJobs method (would need to be implemented)
  // This is a placeholder - in a real implementation you'd add pagination to the service
  const jobs = await getConversionService().getAllJobs();
  
  // Simple in-memory pagination for demonstration
  const { limit, cursor } = req.pagination!;
  const startIndex = cursor ? parseInt(Buffer.from(cursor, 'base64').toString()) : 0;
  const endIndex = startIndex + limit;
  const paginatedJobs = jobs.slice(startIndex, endIndex);
  const hasNext = endIndex < jobs.length;
  
  const response = createPaginatedResponse(
    paginatedJobs,
    req.pagination!,
    req,
    {
      hasNext,
      hasPrev: startIndex > 0,
      total: jobs.length,
      nextCursor: hasNext ? Buffer.from(endIndex.toString()).toString('base64') : undefined,
      prevCursor: startIndex > 0 ? Buffer.from(Math.max(0, startIndex - limit).toString()).toString('base64') : undefined
    }
  );

  (response as any).requestId = req.requestId;
  res.json(response);
}));

export default router;