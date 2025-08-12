import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { generateId, isValidImageFormat, sanitizeFilename } from '../../../shared/utils';
import { MAX_FILE_SIZE } from '../../../shared/constants';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { FileService } from '../services/FileService';
import { paginationMiddleware, createPaginatedResponse } from '../utils/pagination';
import { resourceETagMiddleware, generateStrongETag } from '../middleware/etag';
import { uploadIdempotencyMiddleware } from '../middleware/idempotency';

const router = Router();

// List files with pagination
router.get('/', paginationMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const fileService = new FileService();
  const result = await fileService.getFilesPaginated(req.pagination!);
  
  const response = createPaginatedResponse(
    result.files,
    req.pagination!,
    req,
    {
      hasNext: result.hasNext,
      hasPrev: !!req.pagination!.cursor,
      total: result.total,
      nextCursor: result.nextCursor,
      prevCursor: result.prevCursor
    }
  );

  // Add requestId
  (response as any).requestId = req.requestId;

  res.json(response);
}));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const id = generateId();
    const ext = path.extname(file.originalname);
    const sanitizedName = sanitizeFilename(path.basename(file.originalname, ext));
    cb(null, `${id}_${sanitizedName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10
  },
  fileFilter: (req, file, cb) => {
    if (!isValidImageFormat(file.mimetype)) {
      return cb(createError('Invalid file format', 400, 'INVALID_FORMAT'));
    }
    cb(null, true);
  }
});

// Upload single file
router.post('/', uploadIdempotencyMiddleware, upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw createError('No file provided', 400, 'NO_FILE');
  }

  try {
    // Extract image metadata using Sharp
    const metadata = await sharp(req.file.path).metadata();
    
    const fileData = {
      id: generateId(),
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      metadata: {
        width: metadata.width || 0,
        height: metadata.height || 0,
        channels: metadata.channels || 0,
        colorSpace: metadata.space || 'unknown',
        hasAlpha: metadata.hasAlpha || false,
        density: metadata.density
      }
    };

    // Save file info to database
    const fileService = new FileService();
    await fileService.saveFile(fileData);

    res.json({
      success: true,
      data: {
        id: fileData.id,
        originalName: fileData.originalName,
        size: fileData.size,
        mimetype: fileData.mimetype,
        metadata: fileData.metadata
      },
      requestId: req.requestId
    });
  } catch (error) {
    console.error('Upload error:', error);
    throw createError('Failed to process uploaded file', 500, 'UPLOAD_ERROR');
  }
}));

// Upload multiple files
router.post('/batch', uploadIdempotencyMiddleware, upload.array('files', 10), asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  
  if (!files || files.length === 0) {
    throw createError('No files provided', 400, 'NO_FILES');
  }

  const fileService = new FileService();
  const results = [];

  try {
    for (const file of files) {
      try {
        // Extract image metadata
        const metadata = await sharp(file.path).metadata();
        
        const fileData = {
          id: generateId(),
          originalName: file.originalname,
          filename: file.filename,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path,
          metadata: {
            width: metadata.width || 0,
            height: metadata.height || 0,
            channels: metadata.channels || 0,
            colorSpace: metadata.space || 'unknown',
            hasAlpha: metadata.hasAlpha || false,
            density: metadata.density
          }
        };

        await fileService.saveFile(fileData);
        
        results.push({
          id: fileData.id,
          originalName: fileData.originalName,
          size: fileData.size,
          mimetype: fileData.mimetype,
          metadata: fileData.metadata
        });
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        results.push({
          originalName: file.originalname,
          error: 'Failed to process file'
        });
      }
    }

    res.json({
      success: true,
      data: results,
      requestId: req.requestId
    });
  } catch (error) {
    console.error('Batch upload error:', error);
    throw createError('Failed to process uploaded files', 500, 'BATCH_UPLOAD_ERROR');
  }
}));

// Get file info with ETag support
router.get('/:id', 
  resourceETagMiddleware(async (req) => {
    const fileService = new FileService();
    const file = await fileService.getFile(req.params.id);
    if (!file) return null;
    
    // Generate ETag based on file ID and upload timestamp
    const etag = generateStrongETag(file.id, file.uploadedAt.getTime().toString());
    return {
      etag,
      lastModified: file.uploadedAt
    };
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const fileService = new FileService();
    const file = await fileService.getFile(req.params.id);
    
    if (!file) {
      throw createError('File not found', 404, 'FILE_NOT_FOUND');
    }

    res.json({
      success: true,
      data: file,
      requestId: req.requestId
    });
  })
);

// Download file
router.get('/:id/download', asyncHandler(async (req: Request, res: Response) => {
  const fileService = new FileService();
  const file = await fileService.getFile(req.params.id);
  
  if (!file) {
    throw createError('File not found', 404, 'FILE_NOT_FOUND');
  }

  const absolutePath = path.isAbsolute(file.path) ? file.path : path.resolve(file.path);
  res.download(absolutePath, file.originalName);
}));

// Get thumbnail (for now, just serve the original image)
router.get('/:id/thumbnail', asyncHandler(async (req: Request, res: Response) => {
  const fileService = new FileService();
  const file = await fileService.getFile(req.params.id);
  
  if (!file) {
    throw createError('File not found', 404, 'FILE_NOT_FOUND');
  }

  // For now, serve the original image
  // TODO: Generate actual thumbnails using Sharp
  const absolutePath = path.isAbsolute(file.path) ? file.path : path.resolve(file.path);
  res.sendFile(absolutePath);
}));

// Delete file
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const fileService = new FileService();
  await fileService.deleteFile(req.params.id);
  
  res.json({
    success: true,
    message: 'File deleted successfully',
    requestId: req.requestId
  });
}));

export default router;