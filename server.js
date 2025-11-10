import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { pool } from './config/db.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

app.get('/api/all', async (req, res) => {
    const client = await pool.connect();
    try {
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
        res.json(allData);
    } finally {
        client.release();
    }
});

app.get('/api/report', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows: complaints } = await client.query(`
            SELECT 
                c.complaint_id,
                c.description,
                c.status,
                c.severity,
                c.created_at,
                c.dept_id,
                d.dept_name
            FROM complaints c
            LEFT JOIN departments d ON c.dept_id = d.dept_id
            ORDER BY c.created_at DESC
        `);

        const formattedComplaints = complaints.map(complaint => {
            // Generate a summary from the description
            const summary = complaint.description.split('\n')[0];
            
            // Get the lowercase category from department name
            const category = complaint.dept_name ? complaint.dept_name.toLowerCase().replace(/[&\s]+/g, '_') : null;

            // Keep suggestions as null since they're not in the database
            const suggestions = null;

            // Keep contacts as null since they're not in the database
            const contacts = null;

            return {
                id: complaint.complaint_id,
                category,
                student_view: {
                    complaint: complaint.description,
                    departments: complaint.dept_name ? [complaint.dept_name] : null,
                    contacts: null,  // Since contacts are not in database
                    suggestions: null,  // Since suggestions are not in database
                    severity: complaint.severity,
                    institute: null,  // Since institute is not in database
                    timestamp: complaint.created_at,
                    status: complaint.status
                },
                admin_view: {
                    timestamp: complaint.created_at,
                    severity: complaint.severity,
                    summary: complaint.description ? complaint.description.split('\n')[0] : null,
                    complaint: complaint.description,
                    departments: complaint.dept_name ? [complaint.dept_name] : null,
                    institute: null,  // Since institute is not in database
                    officer_brief: null,  // Since officer_brief is not in database
                    status: complaint.status
                }
            };
        });

        res.json(formattedComplaints);
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