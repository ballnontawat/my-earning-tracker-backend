// server.js

require('dotenv').config(); // Load variables from .env first
const express = require('express');
const { Pool } = require('pg'); // For PostgreSQL
const cors = require('cors');
const url = require('url'); // Add this line for URL parsing

const app = express();
const port = process.env.PORT || 3000; // Use port 3000 or from Environment Variable

// Middleware
app.use(express.json()); // For Parse JSON body
app.use(cors()); // Allow your Frontend to call API

// Database Connection (Updated to parse DATABASE_URL explicitly)
// Parse the DATABASE_URL to get host, port, etc.
const params = url.parse(process.env.DATABASE_URL);
const auth = params.auth.split(':'); // Split user and password

const pool = new Pool({
    user: auth[0],
    password: auth[1],
    host: params.hostname, // Extract hostname
    port: params.port,     // Extract port
    database: params.pathname.split('/')[1], // Extract database name
    ssl: params.query.sslmode === 'require' ? { rejectUnauthorized: false } : false, // Adjust SSL based on sslmode=require
});

// Test database connection
pool.connect()
    .then(client => {
        console.log('Connected to PostgreSQL database on Neon.tech');
        client.release();
    })
    .catch(err => {
        console.error('Error connecting to database', err.stack);
    });

// ----------------------------------------
// API Endpoints for managing notes
// ----------------------------------------

// 1. API: Fetch all notes for the specified month/year
// Example call: GET /api/notes?month=06&year=2025
app.get('/api/notes', async (req, res) => {
    const { year, month } = req.query; // Get year and month from query parameter
    if (!year || !month) {
        return res.status(400).json({ message: 'Missing year or month parameter' });
    }
    try {
        // Select notes for the desired month (adjust table structure and query as needed)
        // Example: Fetch all notes within the specified year and month
        const result = await pool.query(
            `SELECT date_key, note_content FROM notes 
             WHERE EXTRACT(YEAR FROM date_key::date) = $1 
             AND EXTRACT(MONTH FROM date_key::date) = $2`,
            [year, month]
        );

        // Convert array of objects to an object with date_key as key (like notes in Frontend)
        const notesMap = result.rows.reduce((acc, row) => {
            acc[row.date_key] = row.note_content;
            return acc;
        }, {});

        res.status(200).json(notesMap);
    } catch (error) {
        console.error('Error fetching notes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// 2. API: Save/Update a note
// Example call: POST /api/notes
// Body: { "date_key": "YYYY-MM-DD", "note_content": "Note text" }
app.post('/api/notes', async (req, res) => {
    const { date_key, note_content } = req.body;
    if (!date_key || note_content === undefined) { // note_content can be an empty string
        return res.status(400).json({ message: 'Missing date_key or note_content' });
    }
    try {
        if (note_content.trim() === '') {
            // If an empty note is sent, delete that note
            await pool.query('DELETE FROM notes WHERE date_key = $1', [date_key]);
            res.status(200).json({ message: 'Note deleted successfully' });
        } else {
            // If there is a note, INSERT or UPDATE
            await pool.query(
                'INSERT INTO notes (date_key, note_content) VALUES ($1, $2) ON CONFLICT (date_key) DO UPDATE SET note_content = $2',
                [date_key, note_content]
            );
            res.status(200).json({ message: 'Note saved successfully' });
        }
    } catch (error) {
        console.error('Error saving note:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// 3. API: Delete a note
// Example call: DELETE /api/notes/YYYY-MM-DD
app.delete('/api/notes/:date_key', async (req, res) => {
    const { date_key } = req.params;
    try {
        await pool.query('DELETE FROM notes WHERE date_key = $1', [date_key]);
        res.status(200).json({ message: 'Note deleted successfully' });
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Start Server
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});