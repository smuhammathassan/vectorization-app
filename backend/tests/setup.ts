import path from 'path';
import fs from 'fs';

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = ':memory:'; // Use in-memory SQLite for tests
  process.env.UPLOAD_DIR = path.join(__dirname, '../test-uploads');
  process.env.TEMP_DIR = path.join(__dirname, '../test-temp');
  
  // Create test directories
  const testUploadDir = process.env.UPLOAD_DIR!;
  const testTempDir = process.env.TEMP_DIR!;
  
  if (!fs.existsSync(testUploadDir)) {
    fs.mkdirSync(testUploadDir, { recursive: true });
  }
  
  if (!fs.existsSync(testTempDir)) {
    fs.mkdirSync(testTempDir, { recursive: true });
  }
});

afterAll(async () => {
  // Cleanup test directories
  const testUploadDir = process.env.UPLOAD_DIR!;
  const testTempDir = process.env.TEMP_DIR!;
  
  if (fs.existsSync(testUploadDir)) {
    fs.rmSync(testUploadDir, { recursive: true, force: true });
  }
  
  if (fs.existsSync(testTempDir)) {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  }
});

// Extend Jest matchers
expect.extend({
  toBeValidSVG(received: string) {
    const isSVG = received.includes('<svg') && received.includes('</svg>');
    if (isSVG) {
      return {
        message: () => `expected ${received} not to be valid SVG`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be valid SVG`,
        pass: false,
      };
    }
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidSVG(): R;
    }
  }
}