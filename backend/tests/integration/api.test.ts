import request from 'supertest';
import express from 'express';
import path from 'path';
import fs from 'fs';

// Import routes
import methodsRouter from '../../src/routes/methods';
import uploadRouter from '../../src/routes/upload';
import conversionRouter from '../../src/routes/conversion';

// Create test app
const createTestApp = () => {
  const app = express();
  
  app.use(express.json());
  app.use('/api/methods', methodsRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/convert', conversionRouter);
  
  return app;
};

describe('API Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = createTestApp();
    
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.UPLOAD_DIR = path.join(__dirname, '../test-uploads');
    process.env.TEMP_DIR = path.join(__dirname, '../test-temp');
    
    // Create test directories if they don't exist
    if (!fs.existsSync(process.env.UPLOAD_DIR)) {
      fs.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
    }
    if (!fs.existsSync(process.env.TEMP_DIR)) {
      fs.mkdirSync(process.env.TEMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup test directories
    if (fs.existsSync(process.env.UPLOAD_DIR!)) {
      fs.rmSync(process.env.UPLOAD_DIR!, { recursive: true, force: true });
    }
    if (fs.existsSync(process.env.TEMP_DIR!)) {
      fs.rmSync(process.env.TEMP_DIR!, { recursive: true, force: true });
    }
  });

  describe('GET /api/methods', () => {
    test('should return list of conversion methods', async () => {
      const response = await request(app)
        .get('/api/methods')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Check structure of first method
      const firstMethod = response.body.data[0];
      expect(firstMethod).toHaveProperty('name');
      expect(firstMethod).toHaveProperty('description');
      expect(firstMethod).toHaveProperty('category');
      expect(firstMethod).toHaveProperty('supportedFormats');
      expect(firstMethod).toHaveProperty('parameters');
      expect(firstMethod).toHaveProperty('performance');
      expect(firstMethod).toHaveProperty('available');
    });

    test('should return methods with correct structure', async () => {
      const response = await request(app)
        .get('/api/methods')
        .expect(200);

      response.body.data.forEach((method: any) => {
        expect(typeof method.name).toBe('string');
        expect(typeof method.description).toBe('string');
        expect(['traditional', 'modern', 'ai', 'external']).toContain(method.category);
        expect(Array.isArray(method.supportedFormats)).toBe(true);
        expect(Array.isArray(method.parameters)).toBe(true);
        expect(typeof method.performance).toBe('object');
        expect(typeof method.available).toBe('boolean');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for unknown routes', async () => {
      await request(app)
        .get('/api/unknown-route')
        .expect(404);
    });

    test('should handle invalid JSON in request body', async () => {
      await request(app)
        .post('/api/convert')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);
    });
  });

  describe('CORS Headers', () => {
    test('should include CORS headers in responses', async () => {
      const response = await request(app)
        .get('/api/methods')
        .expect(200);

      // Check for basic CORS headers that should be present
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Content Type Handling', () => {
    test('should return JSON content type', async () => {
      const response = await request(app)
        .get('/api/methods')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Request Validation', () => {
    test('should reject POST requests without required fields', async () => {
      const response = await request(app)
        .post('/api/convert')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Status Endpoints', () => {
    test('should handle status requests gracefully', async () => {
      // Try to get status for a non-existent job
      const response = await request(app)
        .get('/api/convert/non-existent-job/status')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Method Information', () => {
    test('should provide detailed method information', async () => {
      const response = await request(app)
        .get('/api/methods')
        .expect(200);

      const methods = response.body.data;
      
      // Should have multiple conversion methods
      expect(methods.length).toBeGreaterThanOrEqual(3);
      
      // Should have different categories
      const categories = [...new Set(methods.map((m: any) => m.category))];
      expect(categories.length).toBeGreaterThan(1);
      
      // Should have methods with parameters
      const methodsWithParams = methods.filter((m: any) => m.parameters.length > 0);
      expect(methodsWithParams.length).toBeGreaterThan(0);
    });

    test('should include performance information for all methods', async () => {
      const response = await request(app)
        .get('/api/methods')
        .expect(200);

      response.body.data.forEach((method: any) => {
        expect(method.performance).toHaveProperty('speed');
        expect(method.performance).toHaveProperty('quality');
        expect(method.performance).toHaveProperty('memoryUsage');
        expect(method.performance).toHaveProperty('bestFor');
        expect(Array.isArray(method.performance.bestFor)).toBe(true);
      });
    });
  });
});