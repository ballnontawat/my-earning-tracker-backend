app.get('/api/notes', async (req, res) => {
    const { year, month } = req.query; // Get year and month from query parameter
    if (!year || !month) { // <--- บรรทัดนี้คือตัวที่ทำให้เกิด Error 400
        return res.status(400).json({ message: 'Missing year or month parameter' });
    }
    // ... ส่วนที่เหลือของโค้ด
});