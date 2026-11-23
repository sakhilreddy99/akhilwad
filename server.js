/**
 * PlatePilot Backend Server
 * 3-Tier Enterprise Web Application
 * Express.js + SQLite + Knapsack Heuristic Optimization Engine
 */

const express = require('express');
const path = require('path');
const cors = require('cors');

const { securityHeaders, rateLimiter } = require('./src/middleware/security');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const apiRoutes = require('./src/routes/api');
const { getDatabase } = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Database & Seed data
getDatabase();

// Security & Parsing Middleware
app.use(securityHeaders);
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(rateLimiter);

// Serve Frontend Static Assets
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', apiRoutes);

// Fallback for SPA (serves index.html for unknown web paths)
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` PlatePilot: NutriNinja Cup Server Running on Port ${PORT}`);
    console.log(` Web UI:    http://localhost:${PORT}`);
    console.log(` API Docs:  http://localhost:${PORT}/api/health`);
    console.log(` Database:  SQLite (Auto-Migrated & Seeded with 50 recipes)`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
