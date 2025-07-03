require('dotenv').config(); // โหลดตัวแปรจาก .env ก่อน
const express = require('express');
const { Pool } = require('pg'); // สำหรับ PostgreSQL
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000; // ใช้พอร์ต 3000 หรือจาก Environment Variable

// Middleware
app.use(express.json()); // สำหรับ Parse JSON body
app.use(cors()); // อนุญาตให้ Frontend ของคุณเรียก API ได้

// เชื่อมต่อฐานข้อมูล
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // สำหรับ Neon.tech ต้องใช้ ssl
    }
});

// ทดสอบการเชื่อมต่อฐานข้อมูล
pool.connect()
    .then(client => {
        console.log('Connected to PostgreSQL database on Neon.tech');
        client.release();
    })
    .catch(err => {
        console.error('Error connecting to database', err.stack);
    });

// ----------------------------------------
// API Endpoints สำหรับจัดการโน้ต
// ----------------------------------------

// 1. API: ดึงโน้ตทั้งหมดสำหรับเดือน/ปีที่ระบุ
// ตัวอย่างการเรียก: GET /api/notes?month=06&year=2025
app.get('/api/notes', async (req, res) => {
    const { year, month } = req.query; // รับ year และ month จาก query parameter
    if (!year || !month) {
        return res.status(400).json({ message: 'Missing year or month parameter' });
    }
    try {
        // เลือกโน้ตสำหรับเดือนที่ต้องการ (ต้องเปลี่ยนโครงสร้างตารางและ query ให้เหมาะสม)
        // ตัวอย่าง: ดึงโน้ตทั้งหมดที่อยู่ในปีและเดือนที่ระบุ
        const result = await pool.query(
            `SELECT date_key, note_content FROM notes 
             WHERE EXTRACT(YEAR FROM date_key::date) = $1 
             AND EXTRACT(MONTH FROM date_key::date) = $2`,
            [year, month]
        );

        // แปลง array ของ object ให้เป็น object ที่มี date_key เป็น key (เหมือน notes ใน Frontend)
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

// 2. API: บันทึก/อัปเดตโน้ต
// ตัวอย่างการเรียก: POST /api/notes
// Body: { "date_key": "YYYY-MM-DD", "note_content": "ข้อความโน้ต" }
app.post('/api/notes', async (req, res) => {
    const { date_key, note_content } = req.body;
    if (!date_key || note_content === undefined) { // note_content อาจเป็น string ว่างได้
        return res.status(400).json({ message: 'Missing date_key or note_content' });
    }
    try {
        if (note_content.trim() === '') {
            // ถ้าส่งโน้ตว่างเปล่ามา ให้ลบโน้ตนั้นออก
            await pool.query('DELETE FROM notes WHERE date_key = $1', [date_key]);
            res.status(200).json({ message: 'Note deleted successfully' });
        } else {
            // ถ้ามีโน้ต ให้ INSERT หรือ UPDATE
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

// 3. API: ลบโน้ต
// ตัวอย่างการเรียก: DELETE /api/notes/YYYY-MM-DD
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

// เริ่มต้น Server
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});