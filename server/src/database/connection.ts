import mysql from 'mysql2/promise';
import { Logger } from '../utils/logger';

const logger = new Logger();

export interface DatabaseConfig {
    host: string;
    user: string;
    password: string;
    database: string;
    waitForConnections: boolean;
    connectionLimit: number;
    queueLimit: number;
}

let pool: mysql.Pool;

export async function initializeDatabase(config: DatabaseConfig): Promise<mysql.Pool> {
    try {
        pool = mysql.createPool({
            host: config.host || process.env.DB_HOST || 'localhost',
            user: config.user || process.env.DB_USER || 'root',
            password: config.password || process.env.DB_PASSWORD || '',
            database: config.database || process.env.DB_NAME || 'uas_admin',
            waitForConnections: config.waitForConnections ?? true,
            connectionLimit: config.connectionLimit || 10,
            queueLimit: config.queueLimit || 0
        });

        // Test connection
        const connection = await pool.getConnection();
        logger.info('Successfully connected to MySQL database');
        connection.release();

        (global as any).connection = true;

        return pool;
    } catch (error) {
        logger.error('Failed to connect to MySQL database:', error);
        (global as any).connection = false;
        throw error;
    }
}

export function getPool(): mysql.Pool {
    if (!pool) {
        throw new Error('Database pool not initialized. Call initializeDatabase() first.');
    }
    return pool;
}

export async function executeQuery(sql: string, values?: any[]): Promise<any> {
    const connection = await getPool().getConnection();
    try {
        const [results] = await connection.execute(sql, values || []);
        return results;
    } finally {
        connection.release();
    }
}

export async function closeDatabase(): Promise<void> {
    (global as any).connection = false;
    if (pool) {
        await pool.end();
        logger.info('Database connection pool closed');
    }
}
