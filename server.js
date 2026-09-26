const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Configure PostgreSQL connection (matches settings you view in DBeaver)
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'data_flow_portal',
    password: process.env.DB_PASSWORD || 'your_password',
    port: process.env.DB_PORT || 5432,
});

// Initialize Database Tables automatically on startup
async function setupDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS portal_users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS portal_datasets (
                id SERIAL PRIMARY KEY,
                dataset_id INT NOT NULL,
                name VARCHAR(150) NOT NULL,
                dept VARCHAR(100) NOT NULL,
                uploader VARCHAR(100) NOT NULL,
                status VARCHAR(50) NOT NULL
            );
        `);
        console.log("PostgreSQL Database tables verified/created successfully.");
    } catch (err) {
        console.error("Database setup error (Make sure PostgreSQL is running):", err.message);
    }
}
setupDatabase();

// API Endpoint for User Registration
api.post('/api/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const newUser = await pool.query(
            'INSERT INTO portal_users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, email, password, role]
        );
        res.json({ success: true, user: newUser.rows[0] });
    } catch (err) {
        res.status(400).json({ success: false, message: 'Email already exists or database error.' });
    }
});

// API Endpoint for User Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM portal_users WHERE email = $1 AND password = $2', [email, password]);
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Data Flow Backend server running on port ${PORT}`);
});
