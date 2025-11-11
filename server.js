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

            // Validation: description required
            if (!description || String(description).trim() === '') {
                throw { name: 'ValidationError', message: `Missing required field: description for complaint id ${complaintId || '<new>'}` };
            }
            // If deptName provided, ensure it exists
            if (deptName) {
                const deptCheck = await client.query('SELECT dept_id FROM departments WHERE dept_name = $1', [deptName]);
                if (deptCheck.rows.length === 0) {
                    throw { name: 'ValidationError', message: `Department not found: ${deptName}` };
                }
            }

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

// --- Additional API endpoints (basic implementations) ---

// Create new user
app.post('/api/users', async (req, res) => {
    const { user_id, role, name, email, phone_number, password_hash } = req.body;
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO users (user_id, role, name, email, phone_number, password_hash, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING user_id`,
            [user_id, role, name, email, phone_number, password_hash]
        );
        res.status(201).json({ user_id: result.rows[0].user_id });
    } catch (err) {
        console.error('Error creating user:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// Simple login (email + password_hash)
app.post('/api/login', async (req, res) => {
    const { email, password_hash } = req.body;
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT * FROM users WHERE email = $1 AND password_hash = $2', [email, password_hash]);
        if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// Get user profile
app.get('/api/users/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT * FROM users WHERE user_id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Get user error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Create driver profile
app.post('/api/driver_profiles', async (req, res) => {
    const { driver_id, vehicle_model, vehicle_number, license_details, contact } = req.body;
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            `INSERT INTO driver_profiles (driver_id, vehicle_model, vehicle_number, license_details, contact)
             VALUES ($1,$2,$3,$4,$5) RETURNING driver_id`,
            [driver_id, vehicle_model, vehicle_number, license_details, contact]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Create driver profile error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Create new complaint (uses dept name from admin_view.departments[0] if provided)
app.post('/api/complaints', async (req, res) => {
    const item = req.body;
    const studentView = item.student_view || {};
    const adminView = item.admin_view || {};
    const complaintId = item.id || null;
    const description = studentView.complaint || null;
    const severity = studentView.severity || null;
    const created_at = studentView.timestamp || null;
    const status = studentView.status || null;
    const student_id = item.student_id || studentView.student_id || null;
    const deptName = Array.isArray(adminView.departments) && adminView.departments.length > 0 ? adminView.departments[0] : null;

    // Validation
    if (!description || String(description).trim() === '') {
        return res.status(400).json({ error: 'description is required' });
    }
    if (deptName) {
        const deptCheck = await (await pool.connect()).query('SELECT dept_id FROM departments WHERE dept_name = $1', [deptName]);
        if (deptCheck.rows.length === 0) return res.status(400).json({ error: `Department not found: ${deptName}` });
    }

    const client = await pool.connect();
    try {
        let insertResult;
        if (deptName) {
            insertResult = await client.query(
                `INSERT INTO complaints (complaint_id, student_id, description, status, severity, created_at, resolved_at, is_archived, dept_id)
                 SELECT $1,$2,$3,$4,$5,$6,NULL,false,d.dept_id
                 FROM departments d
                 WHERE d.dept_name = $7
                 RETURNING complaint_id, dept_id`,
                [complaintId, student_id, description, status, severity, created_at, deptName]
            );
        } else {
            insertResult = await client.query(
                `INSERT INTO complaints (complaint_id, student_id, description, status, severity, created_at, resolved_at, is_archived)
                 VALUES ($1,$2,$3,$4,$5,$6,NULL,false) RETURNING complaint_id`,
                [complaintId, student_id, description, status, severity, created_at]
            );
        }

        if (insertResult.rows.length === 0) return res.status(400).json({ error: 'Department not found' });
        res.status(201).json(insertResult.rows[0]);
    } catch (err) {
        console.error('Create complaint error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Get all complaints (admin view)
app.get('/api/complaints', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            `SELECT c.*, d.dept_name, u.name as student_name
             FROM complaints c
             LEFT JOIN departments d ON c.dept_id = d.dept_id
             LEFT JOIN users u ON c.student_id = u.user_id`);
        res.json(rows);
    } catch (err) {
        console.error('Get complaints error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Get complaints for a student
app.get('/api/complaints/user/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT * FROM complaints WHERE student_id = $1', [req.params.id]);
        res.json(rows);
    } catch (err) {
        console.error('Get student complaints error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Update complaint status
app.patch('/api/complaints/:id/status', async (req, res) => {
    const { status } = req.body;
    const client = await pool.connect();
    try {
        await client.query('UPDATE complaints SET status = $1, resolved_at = CASE WHEN $1 = $2 THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE complaint_id = $3', [status, 'resolved', req.params.id]);
        res.json({ message: 'Status updated' });
    } catch (err) {
        console.error('Update status error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Get complaints by department name (category)
app.get('/api/complaints/category/:deptName', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            `SELECT c.* FROM complaints c JOIN departments d ON c.dept_id = d.dept_id WHERE d.dept_name = $1`, [req.params.deptName]);
        res.json(rows);
    } catch (err) {
        console.error('Get by category error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Create ride booking
app.post('/api/ride_bookings', async (req, res) => {
    const { booking_id, pickup_location, dropoff_location, required_time, status, booking_type, fixed_fare, student_id } = req.body;
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            `INSERT INTO ride_bookings (booking_id, pickup_location, dropoff_location, required_time, status, booking_type, fixed_fare, student_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING booking_id`,
            [booking_id, pickup_location, dropoff_location, required_time, status, booking_type, fixed_fare, student_id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Create booking error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Get pending bookings (driver view)
app.get('/api/ride_bookings/pending', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`SELECT rb.*, u.name as student_name FROM ride_bookings rb LEFT JOIN users u ON rb.student_id = u.user_id WHERE rb.status = 'pending'`);
        res.json(rows);
    } catch (err) {
        console.error('Get pending bookings error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Update booking status / assign driver
app.patch('/api/ride_bookings/:id', async (req, res) => {
    const { status, driver_id } = req.body;
    const client = await pool.connect();
    try {
        await client.query('UPDATE ride_bookings SET status = $1, driver_id = $2 WHERE booking_id = $3', [status, driver_id, req.params.id]);
        res.json({ message: 'Booking updated' });
    } catch (err) {
        console.error('Update booking error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Create schedule
app.post('/api/schedules', async (req, res) => {
    const { schedule_id, dept_id, title, content_url, last_updated_by, is_current } = req.body;
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`INSERT INTO schedules (schedule_id, dept_id, title, content_url, last_updated_by, last_updated_at, is_current) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6) RETURNING schedule_id`, [schedule_id, dept_id, title, content_url, last_updated_by, is_current]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Create schedule error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Get department schedules
app.get('/api/schedules', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT s.*, d.dept_name FROM schedules s LEFT JOIN departments d ON s.dept_id = d.dept_id');
        res.json(rows);
    } catch (err) {
        console.error('Get schedules error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Add department
app.post('/api/departments', async (req, res) => {
    const { dept_id, dept_name } = req.body;
    const client = await pool.connect();
    try {
        const { rows } = await client.query('INSERT INTO departments (dept_id, dept_name) VALUES ($1,$2) RETURNING dept_id', [dept_id, dept_name]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Create department error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Add complaint media
app.post('/api/complaint_media', async (req, res) => {
    const { media_id, complaint_id, file_url, file_type } = req.body;
    const client = await pool.connect();
    try {
        const { rows } = await client.query('INSERT INTO complaint_media (media_id, complaint_id, file_url, file_type) VALUES ($1,$2,$3,$4) RETURNING media_id', [media_id, complaint_id, file_url, file_type]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Create media error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Get complaint media
app.get('/api/complaint_media/:complaintId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT * FROM complaint_media WHERE complaint_id = $1', [req.params.complaintId]);
        res.json(rows);
    } catch (err) {
        console.error('Get media error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Update driver location
app.patch('/api/driver_profiles/:id/location', async (req, res) => {
    const { current_latitude, current_longitude, is_online } = req.body;
    const client = await pool.connect();
    try {
        await client.query('UPDATE driver_profiles SET current_latitude = $1, current_longitude = $2, is_online = $3 WHERE driver_id = $4', [current_latitude, current_longitude, is_online, req.params.id]);
        res.json({ message: 'Driver location updated' });
    } catch (err) {
        console.error('Update driver location error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

// Get nearby drivers (lat,long passed as query params ?lat=..&lon=..)
app.get('/api/driver_profiles/nearby', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return res.status(400).json({ error: 'lat and lon query params required' });
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            `SELECT *, (6371 * acos(cos(radians($1)) * cos(radians(current_latitude)) * cos(radians(current_longitude) - radians($2)) + sin(radians($1)) * sin(radians(current_latitude)))) AS distance
             FROM driver_profiles
             HAVING (6371 * acos(cos(radians($1)) * cos(radians(current_latitude)) * cos(radians(current_longitude) - radians($2)) + sin(radians($1)) * sin(radians(current_latitude)))) < 5
             ORDER BY distance`,
            [lat, lon]
        );
        res.json(rows);
    } catch (err) {
        console.error('Get nearby drivers error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally { client.release(); }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});