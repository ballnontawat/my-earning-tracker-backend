// server.js

// Load environment variables from .env file
require('dotenv').config();

// Import necessary modules
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const url = require('url');

// Initialize Express application
const app = express();
const port = process.env.PORT || 3000;

// ---------------------------
// Middleware Configuration
// ---------------------------
app.use(express.json());
app.use(cors());

// ---------------------------
// Database Connection Setup
// ---------------------------
const params = url.parse(process.env.DATABASE_URL);
const auth = params.auth.split(':');

const pool = new Pool({
    user: auth[0],
    password: auth[1],
    host: params.hostname,
    port: params.port,
    database: params.pathname.split('/')[1],
    ssl: {
        rejectUnauthorized: false
    },
});

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

/**
 * GET /api/notes
 * Fetches all notes from the database, including user_name.
 * Returns an array of note objects: [{ date: "YYYY-MM-DD", text: "Note content", user_name: "User Name" }]
 */
app.get('/api/notes', async (req, res) => {
    try {
        // Select date_key, note_content, AND user_name
        const result = await pool.query(`SELECT date_key, note_content, user_name FROM notes`);

        const notesArray = result.rows.map(row => ({
            date: row.date_key,
            text: row.note_content,
            user_name: row.user_name // Include user_name in the response
        }));

        res.status(200).json(notesArray);
    } catch (error) {
        console.error('Error fetching notes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * POST /api/notes
 * Saves a new note or updates an existing one based on the date, including user_name.
 * If 'text' is empty, the note for that date is deleted.
 * Request body: { "date": "YYYY-MM-DD", "text": "Note text", "user_name": "User Name" }
 */
app.post('/api/notes', async (req, res) => {
    const { date, text, user_name } = req.body; // Destructure user_name as well

    if (!date || text === undefined || !user_name) { // Validate user_name
        return res.status(400).json({ message: 'Missing date, text, or user_name' });
    }

    try {
        if (text.trim() === '') {
            // When deleting, we only need date_key
            await pool.query('DELETE FROM notes WHERE date_key = $1', [date]);
            res.status(200).json({ message: 'Note deleted successfully' });
        } else {
            // Insert or update, now including user_name
            await pool.query(
                'INSERT INTO notes (date_key, note_content, user_name) VALUES ($1, $2, $3) ON CONFLICT (date_key) DO UPDATE SET note_content = $2, user_name = $3',
                [date, text, user_name] // Pass user_name as a parameter
            );
            res.status(200).json({ message: 'Note saved successfully' });
        }
    } catch (error) {
        console.error('Error saving note:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * DELETE /api/notes/:date_key
 * Deletes a note for a specific date.
 * URL parameter: date_key (e.g., YYYY-MM-DD)
 */
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

// ---------------------------
// Start Server
// ---------------------------
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});
