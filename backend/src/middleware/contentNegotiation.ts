import { Request, Response, NextFunction } from 'express';
import { Problems } from '../utils/problemDetails';

// Supported media types
export const SUPPORTED_MEDIA_TYPES = {
  JSON: 'application/json',
  JSON_API: 'application/vnd.api+json',
  JSON_HAL: 'application/hal+json',
  JSON_PROBLEM: 'application/problem+json',
  XML: 'application/xml',
  CSV: 'text/csv',
  YAML: 'application/yaml',
  TEXT: 'text/plain',
  HTML: 'text/html'
} as const;

// Supported encodings
export const SUPPORTED_ENCODINGS = {
  GZIP: 'gzip',
  DEFLATE: 'deflate',
  BROTLI: 'br',
  IDENTITY: 'identity'
} as const;

// Supported languages
export const SUPPORTED_LANGUAGES = {
  ENGLISH: 'en',
  SPANISH: 'es',
  FRENCH: 'fr',
  GERMAN: 'de',
  CHINESE: 'zh',
  JAPANESE: 'ja'
} as const;

// Parse Accept header with quality values
export function parseAcceptHeader(acceptHeader: string): Array<{ type: string; quality: number; params: Record<string, string> }> {
  if (!acceptHeader) return [];

  return acceptHeader
    .split(',')
    .map(entry => {
      const parts = entry.trim().split(';');
      const type = parts[0].trim();
      const params: Record<string, string> = {};
      let quality = 1;

      for (let i = 1; i < parts.length; i++) {
        const [key, value] = parts[i].trim().split('=');
        if (key === 'q') {
          quality = parseFloat(value) || 1;
        } else {
          params[key] = value;
        }
      }

      return { type, quality, params };
    })
    .sort((a, b) => b.quality - a.quality);
}

// Parse Accept-Language header
export function parseAcceptLanguage(acceptLanguage: string): Array<{ language: string; quality: number }> {
  if (!acceptLanguage) return [];

  return acceptLanguage
    .split(',')
    .map(entry => {
      const parts = entry.trim().split(';');
      const language = parts[0].trim();
      let quality = 1;

      if (parts[1]) {
        const qPart = parts[1].trim();
        if (qPart.startsWith('q=')) {
          quality = parseFloat(qPart.substring(2)) || 1;
        }
      }

      return { language, quality };
    })
    .sort((a, b) => b.quality - a.quality);
}

// Parse Accept-Encoding header
export function parseAcceptEncoding(acceptEncoding: string): Array<{ encoding: string; quality: number }> {
  if (!acceptEncoding) return [];

  return acceptEncoding
    .split(',')
    .map(entry => {
      const parts = entry.trim().split(';');
      const encoding = parts[0].trim();
      let quality = 1;

      if (parts[1]) {
        const qPart = parts[1].trim();
        if (qPart.startsWith('q=')) {
          quality = parseFloat(qPart.substring(2)) || 1;
        }
      }

      return { encoding, quality };
    })
    .sort((a, b) => b.quality - a.quality);
}

// Check if media type matches
export function mediaTypeMatches(requested: string, available: string): boolean {
  if (requested === '*/*') return true;
  if (requested === available) return true;
  
  const [requestedType, requestedSubtype] = requested.split('/');
  const [availableType, availableSubtype] = available.split('/');
  
  if (requestedType === availableType && requestedSubtype === '*') return true;
  
  return false;
}

// Select best media type
export function selectMediaType(acceptHeader: string, availableTypes: string[]): string | null {
  const accepted = parseAcceptHeader(acceptHeader);
  
  for (const { type } of accepted) {
    for (const available of availableTypes) {
      if (mediaTypeMatches(type, available)) {
        return available;
      }
    }
  }
  
  return null;
}

// Content negotiation middleware
export function contentNegotiationMiddleware(req: Request, res: Response, next: NextFunction) {
  const acceptHeader = req.headers.accept || '*/*';
  const acceptLanguage = req.headers['accept-language'] as string;
  const acceptEncoding = req.headers['accept-encoding'] as string;
  
  // Available content types for this API
  const availableTypes = [
    SUPPORTED_MEDIA_TYPES.JSON,
    SUPPORTED_MEDIA_TYPES.JSON_API,
    SUPPORTED_MEDIA_TYPES.JSON_HAL,
    SUPPORTED_MEDIA_TYPES.XML,
    SUPPORTED_MEDIA_TYPES.CSV,
    SUPPORTED_MEDIA_TYPES.YAML
  ];
  
  // Select best content type
  const selectedType = selectMediaType(acceptHeader, availableTypes);
  
  if (!selectedType) {
    const problemDetails = Problems.validationError(
      `Unsupported media type. Supported types: ${availableTypes.join(', ')}`,
      req
    );
    problemDetails.supportedMediaTypes = availableTypes;
    
    res.set('Content-Type', 'application/problem+json');
    res.status(406).json(problemDetails);
    return;
  }
  
  // Parse and store negotiated preferences
  (req as any).contentNegotiation = {
    mediaType: selectedType,
    language: parseAcceptLanguage(acceptLanguage || 'en')[0]?.language || 'en',
    encoding: parseAcceptEncoding(acceptEncoding || 'identity')[0]?.encoding || 'identity',
    charsets: 'utf-8' // We only support UTF-8
  };
  
  // Set appropriate response headers
  res.set('Content-Type', `${selectedType}; charset=utf-8`);
  res.set('Content-Language', (req as any).contentNegotiation.language);
  res.set('Vary', 'Accept, Accept-Language, Accept-Encoding');
  
  next();
}

// Response formatter middleware
export function responseFormatterMiddleware(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json;
  
  res.json = function(obj: any) {
    const negotiation = (req as any).contentNegotiation;
    
    if (!negotiation) {
      return originalJson.call(this, obj);
    }
    
    // Format response based on content negotiation
    switch (negotiation.mediaType) {
      case SUPPORTED_MEDIA_TYPES.JSON:
        return originalJson.call(this, obj);
        
      case SUPPORTED_MEDIA_TYPES.JSON_API:
        // Transform to JSON:API format
        const jsonApiResponse = transformToJsonApi(obj, req);
        this.set('Content-Type', 'application/vnd.api+json; charset=utf-8');
        return originalJson.call(this, jsonApiResponse);
        
      case SUPPORTED_MEDIA_TYPES.JSON_HAL:
        // Transform to HAL format
        const halResponse = transformToHal(obj, req);
        this.set('Content-Type', 'application/hal+json; charset=utf-8');
        return originalJson.call(this, halResponse);
        
      case SUPPORTED_MEDIA_TYPES.XML:
        // Transform to XML
        const xmlResponse = transformToXml(obj);
        this.set('Content-Type', 'application/xml; charset=utf-8');
        this.send(xmlResponse);
        return this;
        
      case SUPPORTED_MEDIA_TYPES.CSV:
        // Transform to CSV (for list responses)
        if (Array.isArray(obj.data)) {
          const csvResponse = transformToCsv(obj.data);
          this.set('Content-Type', 'text/csv; charset=utf-8');
          this.set('Content-Disposition', 'attachment; filename="data.csv"');
          this.send(csvResponse);
          return this;
        }
        return originalJson.call(this, obj);
        
      case SUPPORTED_MEDIA_TYPES.YAML:
        // Transform to YAML
        const yamlResponse = transformToYaml(obj);
        this.set('Content-Type', 'application/yaml; charset=utf-8');
        this.send(yamlResponse);
        return this;
        
      default:
        return originalJson.call(this, obj);
    }
  };
  
  next();
}

// Transform to JSON:API format
function transformToJsonApi(data: any, req: Request): any {
  if (data.data && Array.isArray(data.data)) {
    // Collection response
    return {
      jsonapi: { version: '1.0' },
      data: data.data.map((item: any, index: number) => ({
        type: inferResourceType(req.path),
        id: item.id || index.toString(),
        attributes: { ...item, id: undefined }
      })),
      meta: {
        pagination: data.pagination,
        requestId: data.requestId
      },
      links: data.links
    };
  } else if (data.data) {
    // Single resource response
    return {
      jsonapi: { version: '1.0' },
      data: {
        type: inferResourceType(req.path),
        id: data.data.id || '1',
        attributes: { ...data.data, id: undefined }
      },
      meta: {
        requestId: data.requestId
      }
    };
  }
  
  return data;
}

// Transform to HAL format
function transformToHal(data: any, req: Request): any {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  if (data.data && Array.isArray(data.data)) {
    // Collection response
    return {
      _embedded: {
        items: data.data.map((item: any) => ({
          ...item,
          _links: {
            self: { href: `${baseUrl}${req.path}/${item.id}` }
          }
        }))
      },
      _links: {
        self: { href: `${baseUrl}${req.originalUrl}` },
        ...(data.links?.next && { next: { href: data.links.next } }),
        ...(data.links?.prev && { prev: { href: data.links.prev } })
      },
      pagination: data.pagination,
      requestId: data.requestId
    };
  } else if (data.data) {
    // Single resource response
    return {
      ...data.data,
      _links: {
        self: { href: `${baseUrl}${req.originalUrl}` }
      },
      requestId: data.requestId
    };
  }
  
  return data;
}

// Transform to XML
function transformToXml(data: any): string {
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
  
  function objectToXml(obj: any, rootName: string = 'response'): string {
    if (typeof obj !== 'object' || obj === null) {
      return `<${rootName}>${escapeXml(String(obj))}</${rootName}>`;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => objectToXml(item, 'item')).join('');
    }
    
    const xmlContent = Object.entries(obj)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `<${key}>${value.map(item => objectToXml(item, 'item')).join('')}</${key}>`;
        } else if (typeof value === 'object' && value !== null) {
          return `<${key}>${objectToXml(value)}</${key}>`;
        } else {
          return `<${key}>${escapeXml(String(value))}</${key}>`;
        }
      })
      .join('');
    
    return `<${rootName}>${xmlContent}</${rootName}>`;
  }
  
  return xmlHeader + '\n' + objectToXml(data);
}

// Transform to CSV
function transformToCsv(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }
  
  // Get all unique keys from all objects
  const allKeys = new Set<string>();
  data.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(key => allKeys.add(key));
    }
  });
  
  const headers = Array.from(allKeys);
  const csvHeader = headers.map(h => `"${h}"`).join(',');
  
  const csvRows = data.map(item => {
    return headers.map(header => {
      const value = item[header];
      if (value === null || value === undefined) return '""';
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',');
  });
  
  return [csvHeader, ...csvRows].join('\n');
}

// Transform to YAML
function transformToYaml(data: any): string {
  // Simple YAML serialization (in production, use a proper YAML library)
  function objectToYaml(obj: any, indent: number = 0): string {
    const spaces = '  '.repeat(indent);
    
    if (typeof obj !== 'object' || obj === null) {
      return `${obj}`;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => `${spaces}- ${objectToYaml(item, indent + 1)}`).join('\n');
    }
    
    return Object.entries(obj)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${spaces}${key}:\n${objectToYaml(value, indent + 1)}`;
        } else if (typeof value === 'object' && value !== null) {
          return `${spaces}${key}:\n${objectToYaml(value, indent + 1)}`;
        } else {
          return `${spaces}${key}: ${value}`;
        }
      })
      .join('\n');
  }
  
  return objectToYaml(data);
}

// Utility functions
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inferResourceType(path: string): string {
  if (path.includes('/files')) return 'file';
  if (path.includes('/convert')) return 'job';
  if (path.includes('/methods')) return 'method';
  return 'resource';
}

// Declare module augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      contentNegotiation?: {
        mediaType: string;
        language: string;
        encoding: string;
        charsets: string;
      };
    }
  }
}