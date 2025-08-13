import sqlite3 from 'sqlite3';
import path from 'path';
import { promisify } from 'util';

const DB_PATH = path.join(__dirname, '../../data.db');

let db: sqlite3.Database;

export function getDatabase(): sqlite3.Database {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
  }
  return db;
}

export async function initializeDatabase(): Promise<void> {
  const database = getDatabase();
  
  const run = promisify(database.run.bind(database));
  
  try {
    // Files table
    await run(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        filename TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        size INTEGER NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        path TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        channels INTEGER,
        color_space TEXT,
        has_alpha BOOLEAN,
        density INTEGER
      )
    `);

    // Jobs table
    await run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        method TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        parameters TEXT, -- JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        error TEXT,
        estimated_time INTEGER,
        result_path TEXT,
        quality_metrics TEXT, -- JSON string
        FOREIGN KEY (file_id) REFERENCES files (id)
      )
    `);

    // Batch jobs table
    await run(`
      CREATE TABLE IF NOT EXISTS batch_jobs (
        id TEXT PRIMARY KEY,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_jobs INTEGER DEFAULT 0,
        total_jobs INTEGER NOT NULL
      )
    `);

    // Create indexes for better performance
    await run('CREATE INDEX IF NOT EXISTS idx_jobs_file_id ON jobs(file_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)');
    await run('CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files(uploaded_at)');

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}