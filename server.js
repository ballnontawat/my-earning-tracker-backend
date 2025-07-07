require('dotenv').config(); // โหลดค่าจาก .env
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000; // ใช้ PORT จาก .env หรือ 3000

// Middleware
app.use(cors()); // อนุญาตให้ Frontend (ซึ่งอยู่คนละโดเมน) เรียก API ได้
app.use(express.json()); // สำหรับ Parse JSON body จากคำขอ HTTP

// ตั้งค่า Pool สำหรับเชื่อมต่อ PostgreSQL
// การใช้ Pool จะช่วยจัดการการเชื่อมต่อฐานข้อมูลให้มีประสิทธิภาพและเสถียรขึ้น
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // สำหรับ Render.com หรือ SSL ที่ไม่ได้มีใบรับรองเต็มรูปแบบ
    },
    // เพิ่มการกำหนดค่า Pool เพื่อจัดการ Idle Timeout และจำนวน Connection
    // max: 20, // จำนวน Connection สูงสุดใน Pool
    // idleTimeoutMillis: 30000, // Connection ที่ไม่ได้ใช้งานนานแค่ไหนถึงจะถูกปิด (30 วินาที)
    // connectionTimeoutMillis: 2000, // รอนานแค่ไหนในการได้ Connection ใหม่จาก Pool (2 วินาที)
});

// ทดสอบการเชื่อมต่อฐานข้อมูล
pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection error:', err.stack);
        // หากเชื่อมต่อไม่ได้ตั้งแต่แรก อาจจะต้องพิจารณาหยุด Server หรือมีระบบ retry
    } else {
        console.log('Connected to database');
        release(); // ปล่อย client กลับสู่ pool ทันทีหลังจากทดสอบ
    }
});

// --- API Endpoints ---

// Login Endpoint
// หมายเหตุ: การตรวจสอบรหัสผ่านใน Backend แบบนี้ยังไม่ปลอดภัยสำหรับ Production ควรใช้การ Hashing รหัสผ่าน
app.post('/login', async (req, res) => {
    const { password } = req.body;
    let client; // ประกาศ client ไว้ด้านนอก try เพื่อให้เข้าถึงได้ใน finally
    try {
        client = await pool.connect(); // ยืม client จาก pool
        const result = await client.query('SELECT id, username, password FROM users WHERE password = $1', [password]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            // ส่งเฉพาะข้อมูลที่จำเป็นกลับไป ไม่ควรส่งรหัสผ่าน
            res.json({ message: 'Login successful', user: { id: user.id, username: user.username } });
        } else {
            res.status(401).json({ message: 'Invalid password' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Server error during login' });
    } finally {
        if (client) {
            client.release(); // คืน client กลับสู่ pool เสมอ
        }
    }
});

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
            result = await client.query(
                `UPDATE daily_earnings
                 SET daily_wage = $1, overtime_pay = $2, allowance = $3, updated_at = NOW()
                 WHERE user_id = $4 AND record_date = $5
                 RETURNING *`,
                [dailyWage, overtimePay, allowance, userId, recordDate]
            );
            console.log(`Updated daily earnings for user ${userId} on ${recordDate}`);
        } else {
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

    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    // วันสุดท้ายของเดือนนั้นๆ โดยใช้ month + 1 และ day = 0
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

    let startMonth = parseInt(month);
    let startYear = parseInt(year);
    let endMonth = startMonth + 1;
    let endYear = startYear;

    if (startMonth === 12) { // ถ้าเดือนเริ่มต้นคือธันวาคม (12)
        endMonth = 1; // เดือนสิ้นสุดคือมกราคม (1)
        endYear = startYear + 1; // ปีสิ้นสุดคือปีถัดไป
    }
    
    // วันที่เริ่มต้น: วันที่ 21 ของเดือนปัจจุบันที่เลือก
    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-21`;
    // วันที่สิ้นสุด: วันที่ 20 ของเดือนถัดไป
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
        
        // แปลงค่าจาก string/null เป็น number และตั้งค่าเริ่มต้นเป็น 0 ถ้าเป็น null
        // แก้ไขให้ใช้ชื่อคอลัมน์ที่ SUM() แล้วจาก SQL query
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