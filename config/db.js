import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.PG_CONNECTION_STRING;

// Export a single, shared connection pool for your entire application
export const pool = new Pool({
    connectionString: connectionString,
});