// routes/users.js

const express = require('express');
const router = express.Router(); // ✅ This line is crucial
const pool = require('../config/db.js');
const { body, param, validationResult } = require('express-validator');


router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, email, created_at FROM users ORDER BY id DESC');
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Read user by id
router.get('/:id', [param('id').isInt()], async (req, res) => {
const err = handleValidation(req, res);
if (err) return;


try {
const [rows] = await pool.execute('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.params.id]);
if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
res.json({ data: rows[0] });
} catch (error) {
console.error(error);
res.status(500).json({ error: 'Server error' });
}
});


// Update user
router.put('/:id', [param('id').isInt(), body('name').optional().isLength({ min: 1 }), body('email').optional().isEmail()], async (req, res) => {
const err = handleValidation(req, res);
if (err) return;


const { name, email } = req.body;
const id = req.params.id;
try {
// Build dynamic query
const fields = [];
const values = [];
if (name) { fields.push('name = ?'); values.push(name); }
if (email) { fields.push('email = ?'); values.push(email); }
if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });


values.push(id);
const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
const [result] = await pool.execute(sql, values);
if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
res.json({ message: 'Updated' });
} catch (error) {
if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' });
console.error(error);
res.status(500).json({ error: 'Server error' });
}
});


// Delete
router.delete('/:id', [param('id').isInt()], async (req, res) => {
const err = handleValidation(req, res);
if (err) return;
try {
const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
res.json({ message: 'Deleted' });
} catch (error) {
console.error(error);
res.status(500).json({ error: 'Server error' });
}
});


module.exports = router;