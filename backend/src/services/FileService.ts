import { promisify } from 'util';
import fs from 'fs';
import { getDatabase } from '../config/database';
import { FileUpload, ImageMetadata } from '../../../shared/types';

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