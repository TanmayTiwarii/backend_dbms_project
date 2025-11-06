// server.js
const express = require('express');
const dotenv = require('dotenv');
const usersRouter = require('./routes/users');


dotenv.config();
const app = express();
app.use(express.json());


// Basic logger
app.use((req, res, next) => {
console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
next();
});


app.use('/api/users', usersRouter);


// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));


// Global error handler (fallback)
app.use((err, req, res, next) => {
console.error('Unhandled error:', err);
res.status(500).json({ error: 'Internal Server Error' });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));