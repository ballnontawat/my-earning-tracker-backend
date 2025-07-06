// server.js

// Load environment variables from .env file
require('dotenv').config();

// Import necessary modules
const express = require('express'); // <-- บรรทัดนี้สำคัญมาก: นำเข้าโมดูล express
const { Pool } = require('pg'); // PostgreSQL client
const cors = require('cors'); // Middleware สำหรับ Cross-Origin Resource Sharing
const url = require('url'); // โมดูลสำหรับแยกวิเคราะห์ URL

// Initialize Express application
const app = express(); // <-- บรรทัดนี้สำคัญมาก: ประกาศและกำหนดค่าตัวแปร 'app'
// Set the port for the server, defaulting to 3000 if not specified in environment variables
const port = process.env.PORT || 3000;

// ---------------------------
// Middleware Configuration
// ---------------------------

// Enable JSON body parsing for incoming requests
app.use(express.json());
// Enable CORS for all origins (for development purposes, consider restricting in production)
app.use(cors());

// ---------------------------
// Database Connection Setup
// ---------------------------

// Parse the DATABASE_URL from environment variables to extract connection details
const params = url.parse(process.env.DATABASE_URL);
// Extract username and password from the 'auth' part of the URL
const auth = params.auth.split(':');

// Create a new PostgreSQL connection pool
const pool = new Pool({
    user: auth[0], // Database username
    password: auth[1], // Database password
    host: params.hostname, // Database host
    port: params.port,     // Database port
    database: params.pathname.split('/')[1], // Database name (extract from pathname)
    ssl: {
        // Required for connecting to Neon.tech and other cloud PostgreSQL services
        rejectUnauthorized: false // Allows self-signed certificates, useful for some cloud setups
    },
});

// Test the database connection
pool.connect()
    .then(client => {
        console.log('Connected to PostgreSQL database on Neon.tech');
        client.release(); // Release the client back to the pool immediately after testing
    })
    .catch(err => {
        console.error('Error connecting to database', err.stack);
    });

// ----------------------------------------
// API Endpoints for managing notes
// ----------------------------------------

/**
 * GET /api/notes
 * Fetches all notes from the database.
 * The frontend currently fetches all notes without specific month/year parameters.
 * Returns an array of note objects: [{ date: "YYYY-MM-DD", text: "Note content" }]
 */
app.get('/api/notes', async (req, res) => {
    // Removed the check for year and month query parameters as the frontend does not send them.
    // This endpoint will now fetch all notes.
    try {
        // Execute SQL query to select all notes
        const result = await pool.query(`SELECT date_key, note_content FROM notes`);

        // Map the database rows to a more frontend-friendly format
        const notesArray = result.rows.map(row => ({
            date: row.date_key, // Rename 'date_key' from DB to 'date' for frontend consistency
            text: row.note_content // Map 'note_content' from DB to 'text'
        }));

        // Send the notes array as a JSON response with a 200 OK status
        res.status(200).json(notesArray);
    } catch (error) {
        // Log any errors that occur during fetching
        console.error('Error fetching notes:', error);
        // Send a 500 Internal Server Error response
        res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * POST /api/notes
 * Saves a new note or updates an existing one based on the date.
 * If 'text' is empty, the note for that date is deleted.
 * Request body: { "date": "YYYY-MM-DD", "text": "Note text" }
 */
app.post('/api/notes', async (req, res) => {
    // Destructure 'date' and 'text' from the request body
    const { date, text } = req.body;

    // Validate request body parameters
    if (!date || text === undefined) {
        return res.status(400).json({ message: 'Missing date or text' });
    }

    try {
        // If the note text is empty or only contains whitespace, delete the note
        if (text.trim() === '') {
            await pool.query('DELETE FROM notes WHERE date_key = $1', [date]);
            res.status(200).json({ message: 'Note deleted successfully' });
        } else {
            // Insert a new note or update an existing one (ON CONFLICT handles updates)
            await pool.query(
                'INSERT INTO notes (date_key, note_content) VALUES ($1, $2) ON CONFLICT (date_key) DO UPDATE SET note_content = $2',
                [date, text] // Parameters for the SQL query
            );
            res.status(200).json({ message: 'Note saved successfully' });
        }
    } catch (error) {
        // Log any errors that occur during saving/updating
        console.error('Error saving note:', error);
        // Send a 500 Internal Server Error response
        res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * DELETE /api/notes/:date_key
 * Deletes a note for a specific date.
 * URL parameter: date_key (e.g.,YYYY-MM-DD)
 */
app.delete('/api/notes/:date_key', async (req, res) => {
    // Extract 'date_key' from URL parameters
    const { date_key } = req.params;

    try {
        // Execute SQL query to delete the note
        await pool.query('DELETE FROM notes WHERE date_key = $1', [date_key]);
        // Send a 200 OK response indicating successful deletion
        res.status(200).json({ message: 'Note deleted successfully' });
    } catch (error) {
        // Log any errors that occur during deletion
        console.error('Error deleting note:', error);
        // Send a 500 Internal Server Error response
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ---------------------------
// Start Server
// ---------------------------

// Make the Express app listen for incoming requests on the specified port
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});
