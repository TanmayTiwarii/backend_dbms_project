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

// POST endpoint to accept and insert complaint data
app.post('/api/report', async (req, res) => {
    const payload = req.body;
    const items = Array.isArray(payload) ? payload : [payload];
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const inserted = [];

        for (const item of items) {
            const complaintId = item.id;
            const studentView = item.student_view || {};
            const adminView = item.admin_view || {};

            const description = studentView.complaint || null;
            const severity = studentView.severity || null;
            const created_at = studentView.timestamp || null;
            const status = studentView.status || null;

            // Get department name from adminView.departments[0]
            const deptName = Array.isArray(adminView.departments) && adminView.departments.length > 0
                ? adminView.departments[0]
                : null;

            // Insert complaint with JOIN to get dept_id from departments table
            const insertResult = await client.query(
                `INSERT INTO complaints (complaint_id, description, status, severity, created_at, resolved_at, is_archived, dept_id)
                 SELECT $1, $2, $3, $4, $5, NULL, false, d.dept_id
                 FROM departments d
                 WHERE d.dept_name = $6
                 ON CONFLICT (complaint_id) DO UPDATE SET 
                    description = EXCLUDED.description,
                    status = EXCLUDED.status,
                    severity = EXCLUDED.severity,
                    created_at = EXCLUDED.created_at,
                    dept_id = EXCLUDED.dept_id
                 RETURNING complaint_id, dept_id`,
                [complaintId, description, status, severity, created_at, deptName]
            );

            if (insertResult.rows.length > 0) {
                inserted.push({
                    complaint_id: insertResult.rows[0].complaint_id,
                    dept_id: insertResult.rows[0].dept_id,
                    status: 'success'
                });
            } else {
                inserted.push({
                    complaint_id: complaintId,
                    status: 'failed',
                    reason: `Department '${deptName}' not found`
                });
            }
        }

        await client.query('COMMIT');
        res.status(201).json({
            message: 'Insert operation completed',
            results: inserted
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error inserting complaints:', err);
        res.status(500).json({
            error: 'Internal Server Error',
            details: err.message
        });
    } finally {
        client.release();
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});