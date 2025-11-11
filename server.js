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

            // Validate status safely
            status = status ? status.toLowerCase() : null;

            // Get department name from admin view
            const deptName =
                Array.isArray(adminView.departments) && adminView.departments.length > 0
                    ? adminView.departments[0]
                    : null;

            if (!deptName) {
                console.warn(`⚠️ Skipping complaint ${complaintId} (no department)`);
                inserted.push({
                    complaint_id: complaintId,
                    status: 'failed',
                    reason: 'Missing department name'
                });
                continue;
            }

            const insertResult = await client.query(
                `
                INSERT INTO complaints (
                    complaint_id, description, status, severity, created_at,
                    resolved_at, is_archived, dept_id, student_id
                )
                SELECT 
                    $1, $2, $3, $4, $5, NULL, FALSE, d.dept_id, $7
                FROM departments d
                WHERE d.dept_name = $6
                ON CONFLICT (complaint_id)
                DO UPDATE SET
                    description = EXCLUDED.description,
                    status = EXCLUDED.status,
                    severity = EXCLUDED.severity,
                    created_at = EXCLUDED.created_at,
                    dept_id = EXCLUDED.dept_id,
                    student_id = EXCLUDED.student_id
                RETURNING complaint_id, dept_id, student_id;
                `,
                [complaintId, description, status, severity, created_at, deptName, studentRollNumber]
            );

            if (insertResult.rows.length > 0) {
                const row = insertResult.rows[0];
                inserted.push({
                    complaint_id: row.complaint_id,
                    dept_id: row.dept_id,
                    student_id: row.student_id,
                    status: 'success'
                });
                console.log(`✅ Inserted complaint ${row.complaint_id} for student ${row.student_id}`);
            } else {
                inserted.push({
                    complaint_id: complaintId,
                    status: 'failed',
                    reason: `Department '${deptName}' not found`
                });
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

// POST /api/complaints - Add a new complaint with validation
app.post('/api/complaints', async (req, res) => {
    try {
        const { description, dept_name, student_id } = req.body;

        // Validation: description is required
        if (!description || typeof description !== 'string' || description.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Description is required and must be a non-empty string'
            });
        }

        // Validation: dept_name is required (can be null but must be provided)
        if (!('dept_name' in req.body)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Department name is required (can be null)'
            });
        }

        // Validation: student_id is optional but if provided must be valid
        if (student_id && typeof student_id !== 'number' && typeof student_id !== 'string') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Student ID must be a number or string if provided'
            });
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Get dept_id if dept_name is provided
            let deptId = null;
            if (dept_name) {
                const deptResult = await client.query(
                    'SELECT dept_id FROM departments WHERE dept_name = $1',
                    [dept_name]
                );

                if (deptResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        error: 'Bad Request',
                        message: `Department '${dept_name}' not found`
                    });
                }

                deptId = deptResult.rows[0].dept_id;
            }

            // Insert complaint
            const result = await client.query(
                `INSERT INTO complaints (
                    complaint_id, description, status, severity, created_at,
                    resolved_at, is_archived, dept_id, student_id
                )
                VALUES (gen_random_uuid(), $1, 'pending', 3, NOW(), NULL, false, $2, $3)
                RETURNING complaint_id, student_id, description, status, severity, created_at, dept_id`,
                [description, deptId, student_id || null]
            );

            await client.query('COMMIT');
            client.release();

            return res.status(201).json({
                message: 'Complaint created successfully',
                complaint: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error creating complaint:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// GET /api/complaints/:complaint_id - Get a specific complaint
app.get('/api/complaints/:complaint_id', async (req, res) => {
    try {
        const { complaint_id } = req.params;

        // Validation
        if (!complaint_id || typeof complaint_id !== 'string' || complaint_id.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Valid complaint ID is required'
            });
        }

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
                    c.resolved_at,
                    c.is_archived,
                    c.dept_id,
                    d.dept_name,
                    u.name as student_name,
                    u.email as student_email
                FROM complaints c
                LEFT JOIN departments d ON c.dept_id = d.dept_id
                LEFT JOIN users u ON c.student_id = u.user_id
                WHERE c.complaint_id = $1
            `, [complaint_id]);

            client.release();

            if (complaints.length === 0) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: `Complaint with ID ${complaint_id} not found`
                });
            }

            res.json({
                message: 'Complaint fetched successfully',
                complaint: complaints[0]
            });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error fetching complaint:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// GET /api/bookings - Fetch all ride bookings
app.get('/api/bookings', async (req, res) => {
    try {
        const client = await pool.connect();
        const { rows: bookings } = await client.query(`
            SELECT 
                booking_id,
                pickup_location,
                dropoff_location,
                required_time,
                status,
                booking_type,
                booked_time,
                student_id
            FROM ride_bookings
            ORDER BY booked_time DESC
        `);
        client.release();

        res.json({
            message: 'Bookings fetched successfully',
            count: bookings.length,
            bookings: bookings
        });
    } catch (error) {
        console.error('❌ Error fetching bookings:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// GET /api/bookings/:booking_id - Get a specific booking
app.get('/api/bookings/:booking_id', async (req, res) => {
    try {
        const { booking_id } = req.params;

        // Validation
        if (!booking_id || typeof booking_id !== 'string' || booking_id.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Valid booking ID is required'
            });
        }

        const client = await pool.connect();

        try {
            const { rows: bookings } = await client.query(`
                SELECT 
                    booking_id,
                    pickup_location,
                    dropoff_location,
                    required_time,
                    status,
                    booking_type,
                    booked_time,
                    student_id
                FROM ride_bookings
                WHERE booking_id = $1
            `, [booking_id]);

            client.release();

            if (bookings.length === 0) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: `Booking with ID ${booking_id} not found`
                });
            }

            res.json({
                message: 'Booking fetched successfully',
                booking: bookings[0]
            });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error fetching booking:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// POST /api/bookings - Create a new ride booking
app.post('/api/bookings', async (req, res) => {
    try {
        const { pickup_location, dropoff_location, required_time, booking_type, student_id } = req.body;

        // Validation
        if (!pickup_location || typeof pickup_location !== 'string' || pickup_location.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Pickup location is required and must be a non-empty string'
            });
        }

        if (!dropoff_location || typeof dropoff_location !== 'string' || dropoff_location.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Dropoff location is required and must be a non-empty string'
            });
        }

        if (!required_time) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Required time is required'
            });
        }

        if (!booking_type || typeof booking_type !== 'string' || booking_type.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Booking type is required and must be a non-empty string'
            });
        }

        const client = await pool.connect();

        try {
            const result = await client.query(
                `INSERT INTO ride_bookings (
                    pickup_location, dropoff_location, required_time, status, 
                    booking_type, booked_time, student_id
                )
                VALUES ($1, $2, $3, 'pending', $4, NOW(), $5)
                RETURNING booking_id, pickup_location, dropoff_location, required_time, 
                         status, booking_type, booked_time, student_id`,
                [pickup_location, dropoff_location, required_time, booking_type, student_id || null]
            );

            client.release();

            return res.status(201).json({
                message: 'Booking created successfully',
                booking: result.rows[0]
            });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error creating booking:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// GET /api/schedules - Fetch all schedules
app.get('/api/schedules', async (req, res) => {
    try {
        const client = await pool.connect();
        const { rows: schedules } = await client.query(`
            SELECT 
                schedule_id,
                dept_id,
                title,
                coordi_url,
                last_updated_by,
                last_updated_at,
                ts_current
            FROM schedules
            ORDER BY last_updated_at DESC
        `);
        client.release();

        res.json({
            message: 'Schedules fetched successfully',
            count: schedules.length,
            schedules: schedules
        });
    } catch (error) {
        console.error('❌ Error fetching schedules:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// GET /api/schedules/:schedule_id - Get a specific schedule
app.get('/api/schedules/:schedule_id', async (req, res) => {
    try {
        const { schedule_id } = req.params;

        // Validation
        if (!schedule_id || typeof schedule_id !== 'string' || schedule_id.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Valid schedule ID is required'
            });
        }

        const client = await pool.connect();

        try {
            const { rows: schedules } = await client.query(`
                SELECT 
                    schedule_id,
                    dept_id,
                    title,
                    coordi_url,
                    last_updated_by,
                    last_updated_at,
                    ts_current
                FROM schedules
                WHERE schedule_id = $1
            `, [schedule_id]);

            client.release();

            if (schedules.length === 0) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: `Schedule with ID ${schedule_id} not found`
                });
            }

            res.json({
                message: 'Schedule fetched successfully',
                schedule: schedules[0]
            });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error fetching schedule:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// POST /api/schedules - Create a new schedule
app.post('/api/schedules', async (req, res) => {
    try {
        const { dept_id, title, coordi_url, last_updated_by } = req.body;

        // Validation
        if (!dept_id || typeof dept_id !== 'string' || dept_id.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Department ID is required and must be a string'
            });
        }

        if (!title || typeof title !== 'string' || title.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Title is required and must be a non-empty string'
            });
        }

        if (coordi_url && typeof coordi_url !== 'string') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Coordinator URL must be a string if provided'
            });
        }

        if (!last_updated_by || typeof last_updated_by !== 'string' || last_updated_by.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Last updated by is required and must be a non-empty string'
            });
        }

        const client = await pool.connect();

        try {
            // Verify department exists
            const deptCheck = await client.query('SELECT dept_id FROM departments WHERE dept_id = $1', [dept_id]);
            
            if (deptCheck.rows.length === 0) {
                client.release();
                return res.status(400).json({
                    error: 'Bad Request',
                    message: `Department with ID ${dept_id} not found`
                });
            }

            const result = await client.query(
                `INSERT INTO schedules (
                    dept_id, title, coordi_url, last_updated_by, last_updated_at, ts_current
                )
                VALUES ($1, $2, $3, $4, NOW(), NOW())
                RETURNING schedule_id, dept_id, title, coordi_url, last_updated_by, 
                         last_updated_at, ts_current`,
                [dept_id, title, coordi_url || null, last_updated_by]
            );

            client.release();

            return res.status(201).json({
                message: 'Schedule created successfully',
                schedule: result.rows[0]
            });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error creating schedule:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// GET /api/users - Fetch all users
app.get('/api/users', async (req, res) => {
    try {
        const client = await pool.connect();
        const { rows: users } = await client.query(`
            SELECT 
                user_id,
                role,
                name,
                email,
                phone_number,
                is_active
            FROM users
            ORDER BY name ASC
        `);
        client.release();

        res.json({
            message: 'Users fetched successfully',
            count: users.length,
            users: users
        });
    } catch (error) {
        console.error('❌ Error fetching users:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// POST /api/users - Create a new user
app.post('/api/users', async (req, res) => {
    try {
        const { role, name, email, phone_number, password_hash, is_active } = req.body;

        // Validation
        if (!role || typeof role !== 'string' || role.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Role is required and must be a non-empty string'
            });
        }

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Name is required and must be a non-empty string'
            });
        }

        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Valid email is required'
            });
        }

        if (!phone_number || typeof phone_number !== 'string' || phone_number.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Phone number is required and must be a non-empty string'
            });
        }

        if (!password_hash || typeof password_hash !== 'string' || password_hash.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Password hash is required and must be a non-empty string'
            });
        }

        const client = await pool.connect();

        try {
            // Check if email already exists
            const emailCheck = await client.query('SELECT user_id FROM users WHERE email = $1', [email]);
            
            if (emailCheck.rows.length > 0) {
                client.release();
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Email already exists'
                });
            }

            const result = await client.query(
                `INSERT INTO users (
                    role, name, email, phone_number, password_hash, is_active
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING user_id, role, name, email, phone_number, is_active`,
                [role, name, email, phone_number, password_hash, is_active || true]
            );

            client.release();

            return res.status(201).json({
                message: 'User created successfully',
                user: result.rows[0]
            });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// GET /api/users/:user_id/complaints - Get all complaints for a specific user
app.get('/api/users/:user_id/complaints', async (req, res) => {
    try {
        const { user_id } = req.params;

        // Validation
        if (!user_id || typeof user_id !== 'string' || user_id.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Valid user ID is required'
            });
        }

        const client = await pool.connect();

        try {
            // Verify user exists
            const userCheck = await client.query(
                'SELECT user_id, name, email FROM users WHERE user_id = $1',
                [user_id]
            );

            if (userCheck.rows.length === 0) {
                client.release();
                return res.status(404).json({
                    error: 'Not Found',
                    message: `User with ID ${user_id} not found`
                });
            }

            const user = userCheck.rows[0];

            // Fetch complaints for the user
            const { rows: complaints } = await client.query(`
                SELECT 
                    complaint_id,
                    student_id,
                    description,
                    status,
                    severity,
                    created_at,
                    resolved_at,
                    is_archived,
                    dept_id
                FROM complaints
                WHERE student_id = $1
                ORDER BY created_at DESC
            `, [user_id]);

            client.release();

            res.json({
                message: `Complaints for user ${user.name} fetched successfully`,
                user: {
                    user_id: user.user_id,
                    name: user.name,
                    email: user.email
                },
                count: complaints.length,
                complaints: complaints
            });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error fetching user complaints:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// GET /api/departments/:dept_id/complaints - Get all complaints for a specific department
app.get('/api/departments/:dept_id/complaints', async (req, res) => {
    try {
        const { dept_id } = req.params;

        // Validation
        if (!dept_id || typeof dept_id !== 'string' || dept_id.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Valid department ID is required'
            });
        }

        const client = await pool.connect();

        try {
            // Verify department exists
            const deptCheck = await client.query(
                'SELECT dept_id, dept_name FROM departments WHERE dept_id = $1',
                [dept_id]
            );

            if (deptCheck.rows.length === 0) {
                client.release();
                return res.status(404).json({
                    error: 'Not Found',
                    message: `Department with ID ${dept_id} not found`
                });
            }

            const department = deptCheck.rows[0];

            // Fetch complaints for the department
            const { rows: complaints } = await client.query(`
                SELECT 
                    c.complaint_id,
                    c.student_id,
                    c.description,
                    c.status,
                    c.severity,
                    c.created_at,
                    c.resolved_at,
                    c.is_archived,
                    c.dept_id,
                    u.name as student_name,
                    u.email as student_email
                FROM complaints c
                LEFT JOIN users u ON c.student_id = u.user_id
                WHERE c.dept_id = $1
                ORDER BY c.created_at DESC
            `, [dept_id]);

            client.release();

            res.json({
                message: `Complaints for department ${department.dept_name} fetched successfully`,
                department: {
                    dept_id: department.dept_id,
                    dept_name: department.dept_name
                },
                count: complaints.length,
                complaints: complaints
            });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error fetching department complaints:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// GET /api/departments/:dept_name/complaints-by-name - Get complaints for department by name
app.get('/api/departments/:dept_name/complaints-by-name', async (req, res) => {
    try {
        const { dept_name } = req.params;

        // Validation
        if (!dept_name || typeof dept_name !== 'string' || dept_name.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Valid department name is required'
            });
        }

        const client = await pool.connect();

        try {
            // Find department by name
            const deptCheck = await client.query(
                'SELECT dept_id, dept_name FROM departments WHERE LOWER(dept_name) = LOWER($1)',
                [dept_name]
            );

            if (deptCheck.rows.length === 0) {
                client.release();
                return res.status(404).json({
                    error: 'Not Found',
                    message: `Department '${dept_name}' not found`
                });
            }

            const department = deptCheck.rows[0];

            // Fetch complaints for the department
            const { rows: complaints } = await client.query(`
                SELECT 
                    c.complaint_id,
                    c.student_id,
                    c.description,
                    c.status,
                    c.severity,
                    c.created_at,
                    c.resolved_at,
                    c.is_archived,
                    c.dept_id,
                    u.name as student_name,
                    u.email as student_email
                FROM complaints c
                LEFT JOIN users u ON c.student_id = u.user_id
                WHERE c.dept_id = $1
                ORDER BY c.created_at DESC
            `, [department.dept_id]);

            client.release();

            res.json({
                message: `Complaints for department ${department.dept_name} fetched successfully`,
                department: {
                    dept_id: department.dept_id,
                    dept_name: department.dept_name
                },
                count: complaints.length,
                complaints: complaints
            });
        } catch (error) {
            client.release();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error fetching department complaints:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
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
// Route: Get Complaints by Status

app.get('/api/complaints/status/:status', async (req, res) => {
    try {
        const status = req.params.status.toLowerCase();
        const result = await pool.query(
            `SELECT c.*, u.name AS student_name, d.dept_name
             FROM complaints c
             JOIN users u ON c.student_id = u.user_id
             JOIN departments d ON c.dept_id = d.dept_id
             WHERE c.status = $1
             ORDER BY c.created_at DESC;`,
            [status]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error fetching complaints by status:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});




// Route: Get Complaints by Severity

app.get('/api/complaints/severity/:level', async (req, res) => {
    try {
        const level = req.params.level.toLowerCase();
        const severityMap = { low: 1, medium: 2, high: 3 };
        const severity = severityMap[level];

        if (!severity) {
            return res.status(400).json({ error: 'Invalid severity level' });
        }

        const result = await pool.query(
            `SELECT c.*, u.name AS student_name, d.dept_name
             FROM complaints c
             JOIN users u ON c.student_id = u.user_id
             JOIN departments d ON c.dept_id = d.dept_id
             WHERE c.severity = $1
             ORDER BY c.created_at DESC;`,
            [severity]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error fetching complaints by severity:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// Route: Get Complaints by Both Status & Severity

app.get('/api/complaints/status/:status/severity/:level', async (req, res) => {
    try {
        const status = req.params.status.toLowerCase();
        const level = req.params.level.toLowerCase();
        const severityMap = { low: 1, medium: 2, high: 3 };
        const severity = severityMap[level];

        if (!severity) {
            return res.status(400).json({ error: 'Invalid severity level' });
        }

        const result = await pool.query(
            `SELECT c.*, u.name AS student_name, d.dept_name
             FROM complaints c
             JOIN users u ON c.student_id = u.user_id
             JOIN departments d ON c.dept_id = d.dept_id
             WHERE c.status = $1 AND c.severity = $2
             ORDER BY c.created_at DESC;`,
            [status, severity]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error fetching complaints by status & severity:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
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