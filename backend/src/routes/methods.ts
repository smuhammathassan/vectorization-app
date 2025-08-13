import { Router, Request, Response } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { getConversionService } from '../services/ConversionServiceSingleton';

const router = Router();

// Get all available methods
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const methods = await getConversionService().getAllConvertersInfo();
  
  res.json({
    success: true,
    data: methods
  });
}));

// Get specific method info
router.get('/:methodId', asyncHandler(async (req: Request, res: Response) => {
  const method = await getConversionService().getConverterInfo(req.params.methodId);
  
  if (!method) {
    throw createError('Method not found', 404, 'METHOD_NOT_FOUND');
  }

  res.json({
    success: true,
    data: method
  });
}));

export default router;