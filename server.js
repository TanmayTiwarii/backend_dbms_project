import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { pool } from './config/db.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

app.get('/api/report', async (req, res) => {
    const client = await pool.connect();
    try {
        // const result = await client.query('SELECT * FROM complaints');
        // res.json(result.rows);
        // console.log(result.rows);
        const tablesRes = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public';
        `); 
        const allData = {};
        for (const row of tablesRes.rows) {
            const table = row.table_name;
            const { rows: tableRows } = await client.query(`SELECT * FROM ${table}`);
            allData[table] = tableRows;
        }
        console.log(JSON.stringify(allData, null, 2)); // Pretty print
        res.json(allData);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});