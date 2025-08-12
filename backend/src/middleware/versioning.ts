import { Request, Response, NextFunction } from 'express';
import { Problems } from '../utils/problemDetails';

export interface ApiVersion {
  major: number;
  minor: number;
  patch: number;
}

// Current API version
export const CURRENT_VERSION: ApiVersion = {
  major: 1,
  minor: 0,
  patch: 0
};

// Supported API versions
export const SUPPORTED_VERSIONS: ApiVersion[] = [
  { major: 1, minor: 0, patch: 0 }
];

// Parse version string (e.g., "1.0.0" or "v1" or "1")
export function parseVersion(versionString: string): ApiVersion | null {
  if (!versionString) return null;

  // Remove 'v' prefix if present
  const cleanVersion = versionString.toLowerCase().replace(/^v/, '');
  
  // Handle different version formats
  if (cleanVersion === '1' || cleanVersion === '1.0' || cleanVersion === '1.0.0') {
    return { major: 1, minor: 0, patch: 0 };
  }

  // Parse full semantic version
  const parts = cleanVersion.split('.').map(Number);
  if (parts.length >= 1 && parts.every(part => !isNaN(part))) {
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0
    };
  }

  return null;
}

// Check if version is supported
export function isVersionSupported(version: ApiVersion): boolean {
  return SUPPORTED_VERSIONS.some(
    v => v.major === version.major && v.minor === version.minor
  );
}

// Format version as string
export function formatVersion(version: ApiVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

// Get version from request (header, path, or query)
export function extractVersionFromRequest(req: Request): ApiVersion | null {
  // 1. Check Accept header (RFC 6657)
  const acceptHeader = req.headers.accept;
  if (acceptHeader) {
    const versionMatch = acceptHeader.match(/application\/vnd\.yourservice\.v(\d+)(?:\.(\d+))?(?:\.(\d+))?\+json/);
    if (versionMatch) {
      return {
        major: parseInt(versionMatch[1]) || 1,
        minor: parseInt(versionMatch[2]) || 0,
        patch: parseInt(versionMatch[3]) || 0
      };
    }
  }

  // 2. Check custom header
  const versionHeader = req.headers['api-version'] as string;
  if (versionHeader) {
    return parseVersion(versionHeader);
  }

  // 3. Check path prefix (e.g., /api/v1/...)
  const pathMatch = req.path.match(/^\/api\/v(\d+(?:\.\d+)*)/);
  if (pathMatch) {
    return parseVersion(pathMatch[1]);
  }

  // 4. Check query parameter
  const queryVersion = req.query.version as string;
  if (queryVersion) {
    return parseVersion(queryVersion);
  }

  // Default to current version
  return CURRENT_VERSION;
}

// Versioning middleware
export const versioningMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestedVersion = extractVersionFromRequest(req);
  
  if (!requestedVersion) {
    const problemDetails = Problems.validationError(
      'Invalid API version format. Use format: v1, 1.0, or 1.0.0',
      req
    );
    res.set('Content-Type', 'application/problem+json');
    res.status(400).json(problemDetails);
    return;
  }

  if (!isVersionSupported(requestedVersion)) {
    const supportedVersionsStr = SUPPORTED_VERSIONS.map(formatVersion).join(', ');
    const problemDetails = Problems.validationError(
      `API version ${formatVersion(requestedVersion)} is not supported. Supported versions: ${supportedVersionsStr}`,
      req
    );
    
    // Add deprecation/upgrade information
    problemDetails.supportedVersions = SUPPORTED_VERSIONS.map(formatVersion);
    problemDetails.currentVersion = formatVersion(CURRENT_VERSION);
    problemDetails.upgradeUrl = 'https://docs.yourservice.com/api/migration';

    res.set('Content-Type', 'application/problem+json');
    res.status(400).json(problemDetails);
    return;
  }

  // Add version information to request
  (req as any).apiVersion = requestedVersion;
  
  // Add version information to response headers
  res.set('API-Version', formatVersion(requestedVersion));
  res.set('API-Supported-Versions', SUPPORTED_VERSIONS.map(formatVersion).join(', '));
  
  // Add sunset header for deprecated versions (future use)
  if (requestedVersion.major < CURRENT_VERSION.major) {
    res.set('Sunset', 'Sat, 31 Dec 2025 23:59:59 GMT');
    res.set('Deprecation', 'true');
    res.set('Link', '<https://docs.yourservice.com/api/migration>; rel="successor-version"');
  }

  next();
};

// Route versioning helper
export function createVersionedRoute(version: ApiVersion, handler: (req: Request, res: Response, next: NextFunction) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestVersion = (req as any).apiVersion as ApiVersion;
    
    // Check if this handler supports the requested version
    if (requestVersion.major === version.major && requestVersion.minor >= version.minor) {
      handler(req, res, next);
    } else {
      next(); // Pass to next handler
    }
  };
}

// Legacy route handler (for backwards compatibility)
export function legacyRouteHandler(req: Request, res: Response, next: NextFunction) {
  // Handle requests without version specified
  if (!(req as any).apiVersion) {
    (req as any).apiVersion = CURRENT_VERSION;
    res.set('API-Version', formatVersion(CURRENT_VERSION));
  }
  next();
}

// Declare module augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      apiVersion?: ApiVersion;
    }
  }
}