import { Request, Response, NextFunction } from 'express';

export interface PaginationParams {
  limit: number;
  cursor?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    cursor?: string;
    nextCursor?: string;
    prevCursor?: string;
    hasNext: boolean;
    hasPrev: boolean;
    total?: number;
  };
  links?: {
    self: string;
    next?: string;
    prev?: string;
    first?: string;
    last?: string;
  };
}

// Default pagination limits
export const PAGINATION_DEFAULTS = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1
} as const;

// Extract pagination parameters from request
export function extractPaginationParams(req: Request): PaginationParams {
  const query = req.query;
  
  // Parse limit with bounds checking
  let limit = parseInt(query.limit as string) || PAGINATION_DEFAULTS.DEFAULT_LIMIT;
  limit = Math.max(PAGINATION_DEFAULTS.MIN_LIMIT, Math.min(limit, PAGINATION_DEFAULTS.MAX_LIMIT));
  
  // Parse cursor (base64 encoded)
  const cursor = query.cursor as string || undefined;
  
  // Parse sort field
  const sort = query.sort as string || 'createdAt';
  
  // Parse sort order
  const order = (query.order as string)?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  
  return { limit, cursor, sort, order };
}

// Create pagination response with links
export function createPaginatedResponse<T>(
  data: T[],
  params: PaginationParams,
  req: Request,
  options: {
    hasNext: boolean;
    hasPrev: boolean;
    total?: number;
    nextCursor?: string;
    prevCursor?: string;
  }
): PaginatedResponse<T> {
  const baseUrl = `${req.protocol}://${req.get('host')}${req.path}`;
  const queryParams = new URLSearchParams();
  
  // Add non-pagination query params
  Object.entries(req.query).forEach(([key, value]) => {
    if (!['limit', 'cursor', 'sort', 'order'].includes(key) && value) {
      queryParams.append(key, value as string);
    }
  });
  
  // Helper function to create URL with pagination params
  const createUrl = (cursor?: string) => {
    const urlParams = new URLSearchParams(queryParams);
    urlParams.set('limit', params.limit.toString());
    if (cursor) urlParams.set('cursor', cursor);
    return `${baseUrl}?${urlParams.toString()}`;
  };
  
  const response: PaginatedResponse<T> = {
    data,
    pagination: {
      limit: params.limit,
      cursor: params.cursor,
      nextCursor: options.nextCursor,
      prevCursor: options.prevCursor,
      hasNext: options.hasNext,
      hasPrev: options.hasPrev,
      total: options.total
    },
    links: {
      self: createUrl(params.cursor)
    }
  };
  
  // Add navigation links
  if (options.hasNext && options.nextCursor) {
    response.links!.next = createUrl(options.nextCursor);
  }
  
  if (options.hasPrev && options.prevCursor) {
    response.links!.prev = createUrl(options.prevCursor);
  }
  
  // Add first/last links if we have total count
  if (options.total !== undefined) {
    response.links!.first = createUrl(); // No cursor = first page
    // For last page, we'd need to calculate the last cursor, which depends on implementation
  }
  
  return response;
}

// Cursor encoding/decoding utilities
export class CursorPagination {
  // Encode cursor data to base64
  static encode(data: Record<string, any>): string {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }
  
  // Decode base64 cursor to data
  static decode(cursor: string): Record<string, any> {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString());
    } catch (error) {
      throw new Error('Invalid cursor format');
    }
  }
  
  // Create cursor from item (typically using ID and sort field)
  static createCursor(item: any, sortField: string = 'createdAt'): string {
    return this.encode({
      id: item.id,
      [sortField]: item[sortField]
    });
  }
  
  // Create SQL WHERE clause for cursor-based pagination
  static createWhereClause(
    cursor: string | undefined,
    sortField: string = 'createdAt',
    order: 'asc' | 'desc' = 'desc'
  ): { where: string; params: any[] } {
    if (!cursor) {
      return { where: '', params: [] };
    }
    
    try {
      const decoded = this.decode(cursor);
      const operator = order === 'desc' ? '<' : '>';
      const fallbackOperator = order === 'desc' ? '<=' : '>=';
      
      // Handle case where sort field values are equal (use ID as tiebreaker)
      return {
        where: `(${sortField} ${operator} ? OR (${sortField} = ? AND id ${fallbackOperator} ?))`,
        params: [decoded[sortField], decoded[sortField], decoded.id]
      };
    } catch (error) {
      throw new Error('Invalid cursor format');
    }
  }
}

// Pagination middleware to validate and normalize pagination params
export function paginationMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = extractPaginationParams(req);
    
    // Attach pagination to request for use in route handlers
    (req as any).pagination = pagination;
    
    next();
  } catch (error) {
    res.status(400).json({
      type: 'https://api.yourservice.com/problems/validation-error',
      title: 'Invalid Pagination Parameters',
      status: 400,
      detail: error instanceof Error ? error.message : 'Invalid pagination parameters',
      instance: req.originalUrl
    });
  }
}

// Declare module augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      pagination?: PaginationParams;
    }
  }
}