import fs from 'fs';
import path from 'path';
import { FileService } from '../../../src/services/FileService';
import { ImageMetadata } from '../../../../../shared/types';

// Mock the database
jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(),
  }))
}));

describe('FileService', () => {
  let fileService: FileService;
  let mockDb: any;

  beforeEach(() => {
    fileService = new FileService();
    // Get the mocked database
    const { getDatabase } = require('../../../src/config/database');
    mockDb = getDatabase();
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('saveFile', () => {
    test('should save file data to database', async () => {
      const fileData = {
        id: 'test-file-1',
        originalName: 'test.png',
        filename: 'test-123.png',
        mimetype: 'image/png',
        size: 1024,
        path: '/uploads/test-123.png',
        metadata: {
          width: 100,
          height: 100,
          channels: 3,
          colorSpace: 'srgb',
          hasAlpha: false,
          density: 72
        } as ImageMetadata
      };

      // Mock successful database insertion
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      await expect(fileService.saveFile(fileData)).resolves.toBeUndefined();

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO files'),
        [
          fileData.id,
          fileData.originalName,
          fileData.filename,
          fileData.mimetype,
          fileData.size,
          fileData.path,
          fileData.metadata.width,
          fileData.metadata.height,
          fileData.metadata.channels,
          fileData.metadata.colorSpace,
          fileData.metadata.hasAlpha,
          fileData.metadata.density
        ],
        expect.any(Function)
      );
    });

    test('should reject on database error', async () => {
      const fileData = {
        id: 'test-file-1',
        originalName: 'test.png',
        filename: 'test-123.png',
        mimetype: 'image/png',
        size: 1024,
        path: '/uploads/test-123.png',
        metadata: {
          width: 100,
          height: 100,
          channels: 3,
          colorSpace: 'srgb',
          hasAlpha: false,
          density: 72
        } as ImageMetadata
      };

      const dbError = new Error('Database error');
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(dbError);
      });

      await expect(fileService.saveFile(fileData)).rejects.toThrow('Database error');
    });
  });

  describe('getFileById', () => {
    test('should retrieve file by id', async () => {
      const fileId = 'test-file-1';
      const mockFileData = {
        id: fileId,
        original_name: 'test.png',
        filename: 'test-123.png',
        mimetype: 'image/png',
        size: 1024,
        path: '/uploads/test-123.png',
        width: 100,
        height: 100,
        channels: 3,
        color_space: 'srgb',
        has_alpha: 0,
        density: 72,
        uploaded_at: '2023-01-01T00:00:00.000Z'
      };

      mockDb.get.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null, mockFileData);
      });

      const result = await fileService.getFileById(fileId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(fileId);
      expect(result?.originalName).toBe('test.png');
      expect(result?.metadata.width).toBe(100);
      expect(result?.metadata.hasAlpha).toBe(false);

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM files WHERE id = ?'),
        [fileId],
        expect.any(Function)
      );
    });

    test('should return null for non-existent file', async () => {
      const fileId = 'non-existent';

      mockDb.get.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null, undefined);
      });

      const result = await fileService.getFileById(fileId);

      expect(result).toBeNull();
    });

    test('should reject on database error', async () => {
      const fileId = 'test-file-1';
      const dbError = new Error('Database error');

      mockDb.get.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(dbError);
      });

      await expect(fileService.getFileById(fileId)).rejects.toThrow('Database error');
    });
  });

  describe('getAllFiles', () => {
    test('should retrieve all files', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          original_name: 'test1.png',
          filename: 'test1-123.png',
          mimetype: 'image/png',
          size: 1024,
          path: '/uploads/test1-123.png',
          width: 100,
          height: 100,
          channels: 3,
          color_space: 'srgb',
          has_alpha: 0,
          density: 72,
          uploaded_at: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'file-2',
          original_name: 'test2.jpg',
          filename: 'test2-456.jpg',
          mimetype: 'image/jpeg',
          size: 2048,
          path: '/uploads/test2-456.jpg',
          width: 200,
          height: 150,
          channels: 3,
          color_space: 'srgb',
          has_alpha: 0,
          density: 300,
          uploaded_at: '2023-01-02T00:00:00.000Z'
        }
      ];

      mockDb.all.mockImplementation((query: string, callback: Function) => {
        callback(null, mockFiles);
      });

      const result = await fileService.getAllFiles();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('file-1');
      expect(result[1].id).toBe('file-2');
      expect(result[0].originalName).toBe('test1.png');
      expect(result[1].originalName).toBe('test2.jpg');

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM files'),
        expect.any(Function)
      );
    });

    test('should return empty array when no files exist', async () => {
      mockDb.all.mockImplementation((query: string, callback: Function) => {
        callback(null, []);
      });

      const result = await fileService.getAllFiles();

      expect(result).toEqual([]);
    });

    test('should reject on database error', async () => {
      const dbError = new Error('Database error');

      mockDb.all.mockImplementation((query: string, callback: Function) => {
        callback(dbError);
      });

      await expect(fileService.getAllFiles()).rejects.toThrow('Database error');
    });
  });

  describe('deleteFile', () => {
    test('should delete file from database and filesystem', async () => {
      const fileId = 'test-file-1';
      const filePath = '/uploads/test-123.png';

      // Mock file exists
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      
      // Mock successful file deletion
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue();

      // Mock successful database deletion
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      await expect(fileService.deleteFile(fileId, filePath)).resolves.toBeUndefined();

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM files WHERE id = ?'),
        [fileId],
        expect.any(Function)
      );
    });

    test('should handle missing file gracefully', async () => {
      const fileId = 'test-file-1';
      const filePath = '/uploads/non-existent.png';

      // Mock file doesn't exist
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Mock successful database deletion
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      await expect(fileService.deleteFile(fileId, filePath)).resolves.toBeUndefined();

      expect(mockDb.run).toHaveBeenCalled();
    });

    test('should reject on database error', async () => {
      const fileId = 'test-file-1';
      const filePath = '/uploads/test-123.png';
      const dbError = new Error('Database error');

      // Mock file exists
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue();

      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(dbError);
      });

      await expect(fileService.deleteFile(fileId, filePath)).rejects.toThrow('Database error');
    });

    test('should reject on filesystem error', async () => {
      const fileId = 'test-file-1';
      const filePath = '/uploads/test-123.png';
      const fsError = new Error('File system error');

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs.promises, 'unlink').mockRejectedValue(fsError);

      await expect(fileService.deleteFile(fileId, filePath)).rejects.toThrow('File system error');
    });
  });

  describe('Data Transformation', () => {
    test('should properly transform database row to FileUpload object', async () => {
      const fileId = 'test-file-1';
      const mockRow = {
        id: fileId,
        original_name: 'test image.png',
        filename: 'test-image-123.png',
        mimetype: 'image/png',
        size: 1024,
        path: '/uploads/test-image-123.png',
        width: 100,
        height: 100,
        channels: 4,
        color_space: 'srgb',
        has_alpha: 1,
        density: 300,
        uploaded_at: '2023-01-01T12:00:00.000Z'
      };

      mockDb.get.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null, mockRow);
      });

      const result = await fileService.getFileById(fileId);

      expect(result).toEqual({
        id: fileId,
        originalName: 'test image.png',
        filename: 'test-image-123.png',
        mimetype: 'image/png',
        size: 1024,
        path: '/uploads/test-image-123.png',
        metadata: {
          width: 100,
          height: 100,
          channels: 4,
          colorSpace: 'srgb',
          hasAlpha: true,
          density: 300
        },
        uploadedAt: '2023-01-01T12:00:00.000Z'
      });
    });
  });
});