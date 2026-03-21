const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create uploads directory if not exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/crop', require('./routes/crop'));
app.use('/api/disease', require('./routes/disease'));
app.use('/api/market', require('./routes/market'));
app.use('/api/schemes', require('./routes/schemes'));
app.use('/api/marketplace', require('./routes/marketplace'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/aimarket', require('./routes/aimarket'));
app.use('/api/price', require('./routes/pricesuggestion'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'AgriMind AI Backend Running', timestamp: new Date() });
});

// Serve frontend for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║   🌾 AgriMind AI Server Running        ║
  ║   Port: ${PORT}                           ║
  ║   http://localhost:${PORT}               ║
  ╚════════════════════════════════════════╝
  `);
});

module.exports = app;