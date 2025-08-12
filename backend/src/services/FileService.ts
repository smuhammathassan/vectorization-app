import { promisify } from 'util';
import fs from 'fs';
import { getDatabase } from '../config/database';
import { FileUpload, ImageMetadata } from '../../../shared/types';
import { PaginationParams, CursorPagination } from '../utils/pagination';

const unlink = promisify(fs.unlink);

export class FileService {
  private db = getDatabase();

  async saveFile(fileData: {
    id: string;
    originalName: string;
    filename: string;
    mimetype: string;
    size: number;
    path: string;
    metadata: ImageMetadata;
  }): Promise<void> {
    const query = `
      INSERT INTO files (
        id, original_name, filename, mimetype, size, path,
        width, height, channels, color_space, has_alpha, density
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(
        query,
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
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async getFile(id: string): Promise<FileUpload | null> {
    const query = `
      SELECT 
        id, original_name, filename, mimetype, size, uploaded_at, path,
        width, height, channels, color_space, has_alpha, density
      FROM files 
      WHERE id = ?
    `;

    return new Promise((resolve, reject) => {
      this.db.get(query, [id], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            id: row.id,
            originalName: row.original_name,
            filename: row.filename,
            mimetype: row.mimetype,
            size: row.size,
            uploadedAt: new Date(row.uploaded_at),
            path: row.path,
            metadata: {
              width: row.width,
              height: row.height,
              channels: row.channels,
              colorSpace: row.color_space,
              hasAlpha: row.has_alpha,
              density: row.density
            }
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async getAllFiles(): Promise<FileUpload[]> {
    const query = `
      SELECT 
        id, original_name, filename, mimetype, size, uploaded_at, path,
        width, height, channels, color_space, has_alpha, density
      FROM files 
      ORDER BY uploaded_at DESC
    `;

    return new Promise((resolve, reject) => {
      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const files = rows.map(row => ({
            id: row.id,
            originalName: row.original_name,
            filename: row.filename,
            mimetype: row.mimetype,
            size: row.size,
            uploadedAt: new Date(row.uploaded_at),
            path: row.path,
            metadata: {
              width: row.width,
              height: row.height,
              channels: row.channels,
              colorSpace: row.color_space,
              hasAlpha: row.has_alpha,
              density: row.density
            }
          }));
          resolve(files);
        }
      });
    });
  }

  async getFilesPaginated(params: PaginationParams): Promise<{
    files: FileUpload[];
    hasNext: boolean;
    nextCursor?: string;
    prevCursor?: string;
    total: number;
  }> {
    const { limit, cursor, sort = 'uploaded_at', order = 'desc' } = params;
    
    // Get total count
    const countPromise = new Promise<number>((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM files', [], (err, row: any) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    // Build where clause for cursor pagination
    const { where, params: whereParams } = CursorPagination.createWhereClause(cursor, sort, order);
    
    // Build query
    const orderClause = `ORDER BY ${sort} ${order.toUpperCase()}, id ${order.toUpperCase()}`;
    const whereClause = where ? `WHERE ${where}` : '';
    
    const query = `
      SELECT 
        id, original_name, filename, mimetype, size, uploaded_at, path,
        width, height, channels, color_space, has_alpha, density
      FROM files 
      ${whereClause}
      ${orderClause}
      LIMIT ?
    `;

    const queryParams = [...whereParams, limit + 1]; // +1 to check if there's a next page

    const [total, rows] = await Promise.all([
      countPromise,
      new Promise<any[]>((resolve, reject) => {
        this.db.all(query, queryParams, (err, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      })
    ]);

    const hasNext = rows.length > limit;
    if (hasNext) {
      rows.pop(); // Remove the extra item
    }

    const files = rows.map(row => ({
      id: row.id,
      originalName: row.original_name,
      filename: row.filename,
      mimetype: row.mimetype,
      size: row.size,
      uploadedAt: new Date(row.uploaded_at),
      path: row.path,
      metadata: {
        width: row.width,
        height: row.height,
        channels: row.channels,
        colorSpace: row.color_space,
        hasAlpha: row.has_alpha,
        density: row.density
      }
    }));

    let nextCursor: string | undefined;
    let prevCursor: string | undefined;

    if (hasNext && files.length > 0) {
      const lastItem = files[files.length - 1];
      nextCursor = CursorPagination.createCursor(lastItem, sort);
    }

    if (files.length > 0) {
      const firstItem = files[0];
      prevCursor = CursorPagination.createCursor(firstItem, sort);
    }

    return {
      files,
      hasNext,
      nextCursor,
      prevCursor,
      total
    };
  }

  async deleteFile(id: string): Promise<void> {
    const file = await this.getFile(id);
    if (!file) {
      throw new Error('File not found');
    }

    // Delete physical file
    try {
      await unlink(file.path);
    } catch (error) {
      console.warn(`Could not delete physical file: ${file.path}`, error);
    }

    // Delete from database
    const query = 'DELETE FROM files WHERE id = ?';
    return new Promise((resolve, reject) => {
      this.db.run(query, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async fileExists(id: string): Promise<boolean> {
    const file = await this.getFile(id);
    return file !== null;
  }

  async cleanupOldFiles(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const query = `
      SELECT id, path FROM files 
      WHERE uploaded_at < ?
    `;

    return new Promise((resolve, reject) => {
      this.db.all(query, [cutoffDate.toISOString()], async (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        let deletedCount = 0;
        
        for (const row of rows) {
          try {
            await this.deleteFile(row.id);
            deletedCount++;
          } catch (error) {
            console.warn(`Failed to delete old file ${row.id}:`, error);
          }
        }

        resolve(deletedCount);
      });
    });
  }
}