require('dotenv').config(); // โหลดค่าจาก .env
const express = require('express');
const { Pool } = require('pg');
const cors = require = require('cors'); // แก้ไขตรงนี้: ต้องเป็น require('cors')
const bcrypt = require('bcrypt');
const saltRounds = 10; // กำหนดค่า saltRounds สำหรับ bcrypt

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ตั้งค่า Pool สำหรับเชื่อมต่อ PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // สำหรับ Render.com หรือ SSL ที่ไม่ได้มีใบรับรองเต็มรูปแบบ
    },
});

// ทดสอบการเชื่อมต่อฐานข้อมูล
pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection error:', err.stack);
    } else {
        console.log('Connected to database');
        release();
    }
});

// --- API Endpoints ---

// Login Endpoint (ปรับปรุงให้ใช้ bcrypt และ username)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT id, username, password FROM users WHERE username = $1', [username]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const passwordMatch = await bcrypt.compare(password, user.password); // เปรียบเทียบรหัสผ่านที่ Hash แล้ว

            if (passwordMatch) {
                res.json({ message: 'Login successful', user: { id: user.id, username: user.username } });
            } else {
                res.status(401).json({ message: 'Invalid username or password' });
            }
        } else {
            res.status(401).json({ message: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Server error during login' });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// Register Endpoint (ตัวอย่าง - ถ้าต้องการให้ผู้ใช้สมัครได้เอง)
// คุณสามารถเพิ่มโค้ดนี้ได้หากต้องการฟังก์ชันสมัครสมาชิกในอนาคต
/*
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    let client;
    try {
        client = await pool.connect();
        const hashedPassword = await bcrypt.hash(password, saltRounds); // Hash รหัสผ่าน

        const result = await client.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
            [username, hashedPassword]
        );
        res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') { // PostgreSQL unique violation error
            res.status(409).json({ message: 'Username already exists' });
        } else {
            console.error('Error during registration:', error);
            res.status(500).json({ message: 'Server error during registration' });
        }
    } finally {
        if (client) {
            client.release();
        }
    }
});
*/

// Endpoint สำหรับบันทึกหรืออัปเดตข้อมูลค่าแรงรายวัน
app.post('/api/daily-earnings', async (req, res) => {
    const { userId, recordDate, dailyWage, overtimePay, allowance } = req.body;

    if (!userId || !recordDate) {
        return res.status(400).json({ message: 'User ID and record date are required.' });
    }

    let client;
    try {
        client = await pool.connect();
        const existingEntry = await client.query(
            'SELECT * FROM daily_earnings WHERE user_id = $1 AND record_date = $2',
            [userId, recordDate]
        );

        let result;
        if (existingEntry.rows.length > 0) {
            // Update existing entry
            result = await client.query(
                `UPDATE daily_earnings
                SET daily_wage = $1, overtime_pay = $2, allowance = $3, updated_at = NOW()
                WHERE user_id = $4 AND record_date = $5
                RETURNING *`,
                [dailyWage, overtimePay, allowance, userId, recordDate]
            );
            console.log(`Updated daily earnings for user ${userId} on ${recordDate}`);
        } else {
            // Insert new entry
            result = await client.query(
                `INSERT INTO daily_earnings (user_id, record_date, daily_wage, overtime_pay, allowance)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *`,
                [userId, recordDate, dailyWage, overtimePay, allowance]
            );
            console.log(`Added new daily earnings for user ${userId} on ${recordDate}`);
        }

        res.status(200).json({ message: 'Daily earnings saved successfully', data: result.rows[0] });

    } catch (error) {
        console.error('Error saving daily earnings:', error);
        res.status(500).json({ message: 'Failed to save daily earnings.' });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// Endpoint สำหรับดึงข้อมูลค่าแรงรายวันสำหรับเดือนที่เลือก
app.get('/api/daily-earnings/:userId/:year/:month', async (req, res) => {
    const { userId, year, month } = req.params;

    // คำนวณวันเริ่มต้นและสิ้นสุดของเดือน (สำหรับดึงข้อมูล)
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    // วันสุดท้ายของเดือนคือ วันที่ 0 ของเดือนถัดไป
    const endDate = new Date(year, parseInt(month), 0).toISOString().split('T')[0]; 

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            `SELECT id, user_id, record_date, daily_wage, overtime_pay, allowance
            FROM daily_earnings
            WHERE user_id = $1
                AND record_date >= $2
                AND record_date <= $3
            ORDER BY record_date ASC`,
            [userId, startDate, endDate]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching daily earnings:', error);
        res.status(500).json({ message: 'Failed to fetch daily earnings.' });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// Endpoint สำหรับดึงยอดรวมค่าแรงรายเดือน (ตัดรอบ 21-20)
app.get('/api/monthly-summary/:userId/:year/:month', async (req, res) => {
    const { userId, year, month } = req.params;

    // คำนวณเดือนและปีสำหรับรอบตัดยอด 21-20
    let startMonth = parseInt(month);
    let startYear = parseInt(year);
    let endMonth = startMonth + 1;
    let endYear = startYear;

    // ถ้าเดือนปัจจุบันคือธันวาคม (12), เดือนสิ้นสุดจะเป็นมกราคมของปีถัดไป
    if (startMonth === 12) {
        endMonth = 1;
        endYear = startYear + 1;
    }
    
    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-21`;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-20`;

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            `SELECT
                SUM(daily_wage) AS total_wage,
                SUM(overtime_pay) AS total_overtime,
                SUM(allowance) AS total_allowance
            FROM daily_earnings
            WHERE user_id = $1
                AND record_date >= $2
                AND record_date <= $3`,
            [userId, startDate, endDate]
        );

        const summary = result.rows[0] || { total_wage: 0, total_overtime: 0, total_allowance: 0 };
        
        // แปลงค่าเป็นตัวเลข (ถ้าเป็น null ให้เป็น 0)
        summary.total_wage = parseFloat(summary.total_wage || 0);
        summary.total_overtime = parseFloat(summary.total_overtime || 0); 
        summary.total_allowance = parseFloat(summary.total_allowance || 0); 

        // คำนวณยอดรวมทั้งหมด
        summary.grand_total = summary.total_wage + summary.total_overtime + summary.total_allowance;

        res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching monthly summary:', error);
        res.status(500).json({ message: 'Failed to fetch monthly summary.' });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});