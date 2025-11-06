// routes/users.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db.js'); // ensure path is correct
const { body, param, validationResult } = require('express-validator');

/**
 * handleValidation(req, res)
 * - If validation errors exist: sends 400 response and returns true.
 * - Otherwise returns false (so caller can continue).
 */
function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true; // indicates response already sent
  }
  return false;
}

// Create user
router.post(
  '/',
  [
    body('name').isLength({ min: 1 }).withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;

    const { name, email } = req.body;
    try {
      const [result] = await pool.execute(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [name, email]
      );
      const created = { id: result.insertId, name, email };
      return res.status(201).json({ data: created });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      console.error(error);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

// Read all users
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, email, created_at FROM users ORDER BY id DESC');
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Read user by id
router.get('/:id', [param('id').isInt().withMessage('id must be an integer')], async (req, res) => {
  if (handleValidation(req, res)) return;

  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ data: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user
router.put(
  '/:id',
  [
    param('id').isInt().withMessage('id must be an integer'),
    body('name').optional().isLength({ min: 1 }).withMessage('Name must not be empty'),
    body('email').optional().isEmail().withMessage('Valid email required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;

    const { name, email } = req.body;
    const id = req.params.id;
    try {
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
  }
);

// Delete user
router.delete('/:id', [param('id').isInt().withMessage('id must be an integer')], async (req, res) => {
  if (handleValidation(req, res)) return;

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
