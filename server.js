import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './config/db.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// Get current directory for file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multiple possible paths for complaints_store.json (Flask backend locations)
const possibleJsonPaths = [
  // Direct path to frontend/backend
  path.join(__dirname, '../../../frontend/backend/complaints_store.json'),
  // Alternative paths
  path.join(__dirname, '../../frontend/backend/complaints_store.json'),
  path.join(__dirname, '../../complaints_store.json'),
  path.join(process.cwd(), '../frontend/backend/complaints_store.json'),
  path.join(process.cwd(), 'complaints_store.json'),
  // From project root
  path.resolve(process.cwd(), '../../../frontend/backend/complaints_store.json'),
];

console.log(`📁 Current working directory: ${process.cwd()}`);
console.log(`📁 Script directory (__dirname): ${__dirname}`);

// Find and read complaints from JSON
const readComplaintsFromJson = () => {
  for (const filePath of possibleJsonPaths) {
    try {
      const absolutePath = path.resolve(filePath);
      console.log(`🔍 Checking: ${absolutePath}`);
      
      if (fs.existsSync(absolutePath)) {
        console.log(`✅ Found complaints_store.json at: ${absolutePath}`);
        const data = fs.readFileSync(absolutePath, 'utf-8');
        const complaints = JSON.parse(data);
        console.log(`✓ Read ${Array.isArray(complaints) ? complaints.length : 0} complaints from JSON`);
        return Array.isArray(complaints) ? complaints : [];
      }
    } catch (error) {
      console.warn(`⚠️ Could not read ${filePath}:`, error.message);
    }
  }
  console.warn('⚠️ complaints_store.json not found in any location');
  return [];
};

// Format complaints from JSON to match API format
const formatJsonComplaints = (jsonComplaints) => {
  return jsonComplaints.map(complaint => {
    const adminView = complaint.admin_view || {};
    const studentView = complaint.student_view || complaint;
    
    return {
      id: complaint.id,
      category: complaint.category || adminView.departments?.[0]?.toLowerCase().replace(/[&\s]+/g, '_') || 'other',
      student_view: {
        complaint: studentView.complaint || adminView.complaint || '',
        departments: studentView.departments || adminView.departments || [],
        contacts: studentView.contacts || adminView.contacts || null,
        suggestions: studentView.suggestions || adminView.suggestions || null,
        severity: studentView.severity || adminView.severity || 3,
        institute: studentView.institute || adminView.institute || 'IIIT Nagpur',
        timestamp: studentView.timestamp || adminView.timestamp || new Date().toISOString(),
        status: studentView.status || adminView.status || 'Pending'
      },
      admin_view: {
        timestamp: adminView.timestamp || studentView.timestamp || new Date().toISOString(),
        severity: adminView.severity || studentView.severity || 3,
        summary: adminView.summary || studentView.complaint?.split('\n')[0] || 'No summary',
        complaint: adminView.complaint || studentView.complaint || '',
        departments: adminView.departments || studentView.departments || [],
        institute: adminView.institute || studentView.institute || 'IIIT Nagpur',
        officer_brief: adminView.officer_brief || `Complaint regarding ${adminView.summary || 'complaint'}`,
        suggestions: adminView.suggestions || [],
        status: adminView.status || studentView.status || 'Pending'
      }
    };
  });
};

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
                c.student_id,
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

        const formattedComplaints = complaints.map(complaint => ({
            id: complaint.complaint_id,
            student_id: complaint.student_id,
            category: complaint.dept_name ? complaint.dept_name.toLowerCase().replace(/[&\s]+/g, '_') : null,
            student_view: {
                complaint: complaint.description,
                departments: complaint.dept_name ? [complaint.dept_name] : null,
                contacts: null,
                suggestions: null,
                severity: complaint.severity,
                institute: null,
                timestamp: complaint.created_at,
                status: complaint.status
            },
            admin_view: {
                timestamp: complaint.created_at,
                severity: complaint.severity,
                summary: complaint.description ? complaint.description.split('\n')[0] : null,
                complaint: complaint.description,
                departments: complaint.dept_name ? [complaint.dept_name] : null,
                institute: null,
                officer_brief: null,
                status: complaint.status
            }
        }));

        res.json(formattedComplaints);
    } catch (error) {
        console.error('Error fetching complaints:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

/*
app.get('/api/report', async (req, res) => {
    const client = await pool.connect();
    try {
        console.log('Fetching complaints from database...');
        const { rows: complaints } = await client.query(`
            SELECT 
                c.complaint_id,
                c.student_id,
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

        const formattedComplaints = complaints.map(complaint => ({
            id: complaint.complaint_id,

            category: complaint.dept_name ? complaint.dept_name.toLowerCase().replace(/[&\s]+/g, '_') : null,
            student_view: {
                complaint: complaint.description,
                departments: complaint.dept_name ? [complaint.dept_name] : null,
                contacts: null,
                suggestions: null,
                severity: complaint.severity,
                institute: 'IIIT Nagpur',
                timestamp: complaint.created_at,
                status: complaint.status
            },
            admin_view: {
                timestamp: complaint.created_at,
                severity: complaint.severity,
                summary: complaint.description ? complaint.description.split('\n')[0] : null,
                complaint: complaint.description,
                departments: complaint.dept_name ? [complaint.dept_name] : null,
                institute: 'IIIT Nagpur',
                officer_brief: `Complaint regarding ${complaint.description ? complaint.description.split('\n')[0] : 'N/A'}`,
                status: complaint.status
            }
        }));

        console.log(`✓ Fetched ${formattedComplaints.length} complaints from PostgreSQL`);
        res.json(formattedComplaints);
    } catch (error) {
        console.error('Error fetching complaints:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});
*/
// POST endpoint to accept and insert complaint data from Flask
app.post('/api/report', async (req, res) => {
    const payload = req.body;
    const items = Array.isArray(payload) ? payload : [payload];
    const client = await pool.connect();

    try {
        console.log(`📝 Receiving ${items.length} complaint(s) from Flask...`);
        await client.query('BEGIN');
        const inserted = [];

        for (const item of items) {
            const complaintId = item.id;
            const studentView = item.student_view || {};
            const adminView = item.admin_view || {};
            let status = studentView.status ? studentView.status.toLowerCase() : null;
            const description = studentView.complaint || adminView.complaint || null;
            const severity = adminView.severity || studentView.severity || 3;
            const created_at = studentView.timestamp || adminView.timestamp || new Date();
            const studentRollNumber = item.student_roll_number || null;
            // FIX: Map status to valid enum values (lowercase or specific format your DB expects)
            status = status.toLowerCase(); // Convert "Pending" to "pending"

            // Get department name from adminView.departments[0]
            const deptName = Array.isArray(adminView.departments) && adminView.departments.length > 0
                ? adminView.departments[0]
                : null;

            // Insert complaint with JOIN to get dept_id from departments table
            const insertResult = await client.query(
                `INSERT INTO complaints (
                    complaint_id, description, status, severity, created_at, 
                    resolved_at, is_archived, dept_id, student_id
                   )
                 SELECT 
                    $1, $2, $3, $4, $5, 
                    NULL, false, d.dept_id, 
                    (SELECT user_id FROM users WHERE name = $7)
                 FROM departments d
                 WHERE d.dept_name = $6
                 ON CONFLICT (complaint_id) DO UPDATE SET 
                    description = EXCLUDED.description,
                    status = EXCLUDED.status,
                    severity = EXCLUDED.severity,
                    created_at = EXCLUDED.created_at,
                   dept_id = EXCLUDED.dept_id,
                    student_id = EXCLUDED.student_id
                 RETURNING complaint_id, dept_id, student_id`,
                // $7 is the 'studentRollNumber'
                [complaintId, description, status, severity, created_at, deptName, studentRollNumber]
            );

            if (insertResult.rows.length > 0) {
                inserted.push({
                    complaint_id: insertResult.rows[0].complaint_id,
                    dept_id: insertResult.rows[0].dept_id,
                    status: 'success'
                });
                console.log(`✅ Inserted complaint ${complaintId}`);
            } else {
                inserted.push({
                    complaint_id: complaintId,
                    status: 'failed',
                    reason: `Department '${deptName}' not found`
                });
                console.warn(`⚠️ Department '${deptName}' not found for complaint ${complaintId}`);
            }
        }

        await client.query('COMMIT');
        console.log(`✓ Committed ${inserted.length} complaints to database`);
        res.status(201).json({
            message: 'Insert operation completed',
            results: inserted
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error inserting complaints:', err);
        res.status(500).json({
            error: 'Internal Server Error',
            details: err.message
        });
    } finally {
        client.release();
    }
});

// Updated endpoint: /api/complaints (combines PostgreSQL + JSON)
app.get('/api/complaints', async (req, res) => {
    let allComplaints = [];

    // 1. Fetch from PostgreSQL
    try {
        const client = await pool.connect();
        console.log('🔍 Fetching complaints from PostgreSQL...');
        const { rows: complaints } = await client.query(`
            SELECT 
                c.complaint_id,
                c.student_id,
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
        client.release();

        const pgComplaints = complaints.map(complaint => ({
            id: complaint.complaint_id,
            student_id: complaint.student_id,
            category: complaint.dept_name ? complaint.dept_name.toLowerCase().replace(/[&\s]+/g, '_') : 'other',
            source: 'postgresql',
            student_view: {
                complaint: complaint.description,
                departments: complaint.dept_name ? [complaint.dept_name] : [],
                contacts: null,
                suggestions: null,
                severity: complaint.severity,
                institute: 'IIIT Nagpur',
                timestamp: complaint.created_at,
                status: complaint.status
            },
            admin_view: {
                timestamp: complaint.created_at,
                severity: complaint.severity,
                summary: complaint.description?.split('\n')[0] || 'No summary',
                complaint: complaint.description,
                departments: complaint.dept_name ? [complaint.dept_name] : [],
                institute: 'IIIT Nagpur',
                officer_brief: `Complaint regarding ${complaint.description?.split('\n')[0] || 'complaint'}`,
                suggestions: [],
                status: complaint.status
            }
        }));

        allComplaints.push(...pgComplaints);
        console.log(`✓ Fetched ${pgComplaints.length} complaints from PostgreSQL`);
    } catch (error) {
        console.warn('⚠️ PostgreSQL not available:', error.message);
    }

    // 2. Fetch from JSON file (Flask backend)
    try {
        console.log('🔍 Fetching complaints from JSON...');
        const jsonComplaints = readComplaintsFromJson();
        
        if (Array.isArray(jsonComplaints) && jsonComplaints.length > 0) {
            const formattedJsonComplaints = jsonComplaints.map(complaint => {
                const adminView = complaint.admin_view || {};
                const studentView = complaint.student_view || complaint;
                
                return {
                    id: complaint.id,
                    category: complaint.category || adminView.departments?.[0]?.toLowerCase().replace(/[&\s]+/g, '_') || 'other',
                    source: 'json',
                    student_view: {
                        complaint: studentView.complaint || adminView.complaint || '',
                        departments: studentView.departments || adminView.departments || [],
                        contacts: studentView.contacts || adminView.contacts || null,
                        suggestions: studentView.suggestions || adminView.suggestions || null,
                        severity: studentView.severity || adminView.severity || 3,
                        institute: studentView.institute || adminView.institute || 'IIIT Nagpur',
                        timestamp: studentView.timestamp || adminView.timestamp || new Date().toISOString(),
                        status: studentView.status || adminView.status || 'Pending'
                    },
                    admin_view: {
                        timestamp: adminView.timestamp || studentView.timestamp || new Date().toISOString(),
                        severity: adminView.severity || studentView.severity || 3,
                        summary: adminView.summary || studentView.complaint?.split('\n')[0] || 'No summary',
                        complaint: adminView.complaint || studentView.complaint || '',
                        departments: adminView.departments || studentView.departments || [],
                        institute: adminView.institute || studentView.institute || 'IIIT Nagpur',
                        officer_brief: adminView.officer_brief || `Complaint regarding ${adminView.summary || 'complaint'}`,
                        suggestions: adminView.suggestions || [],
                        status: adminView.status || studentView.status || 'Pending'
                    }
                };
            });
            
            allComplaints.push(...formattedJsonComplaints);
            console.log(`✓ Fetched ${formattedJsonComplaints.length} complaints from JSON`);
        }
    } catch (error) {
        console.warn('⚠️ Could not read JSON complaints:', error.message);
    }

    // 3. Deduplicate by ID (prefer PostgreSQL if duplicate)
    const uniqueComplaints = Array.from(
        new Map(
            allComplaints
                .sort((a, b) => (a.source === 'postgresql' ? -1 : 1)) // PostgreSQL first
                .map(c => [c.id, c])
        ).values()
    );

    console.log(`📊 Total unique complaints: ${uniqueComplaints.length} (PostgreSQL: ${allComplaints.filter(c => c.source === 'postgresql').length}, JSON: ${allComplaints.filter(c => c.source === 'json').length})`);
    
    // Remove source field before sending
    uniqueComplaints.forEach(c => delete c.source);

    res.json(uniqueComplaints);
});

// Health check
app.get('/health', async (req, res) => {
    const status = {
        server: 'ok',
        database: 'checking',
        json: 'checking'
    };

    try {
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        status.database = 'connected';
    } catch (error) {
        status.database = 'disconnected';
    }

    try {
        const jsonData = readComplaintsFromJson();
        status.json = `${jsonData.length} complaints found`;
    } catch (error) {
        status.json = 'error';
    }

    res.json(status);
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
    console.log(`📊 Fetch complaints: GET http://localhost:${PORT}/api/complaints`);
    console.log(`📋 Report complaints: GET/POST http://localhost:${PORT}/api/report`);
    console.log(`📁 All data: GET http://localhost:${PORT}/api/all`);
    console.log(`❤️  Health: GET http://localhost:${PORT}/health`);
    console.log(`\n📁 Looking for complaints_store.json in:`);
    possibleJsonPaths.forEach(p => {
        const absolutePath = path.resolve(p);
        console.log(`   - ${absolutePath}`);
    });
    
    // Try to load JSON on startup
    const jsonComplaints = readComplaintsFromJson();
    console.log(`\n✓ Ready to serve complaints from both PostgreSQL and JSON (${jsonComplaints.length} JSON complaints loaded)`);
});