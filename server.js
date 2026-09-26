const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// PostgreSQL Connection Pool
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'data_flow_portal',
    password: process.env.DB_PASSWORD || 'your_postgres_password',
    port: process.env.DB_PORT || 5432,
});

// Verify PostgreSQL Connection on Startup
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ PostgreSQL Connection Failed:', err.stack);
    } else {
        console.log('✅ PostgreSQL Connected Successfully at:', res.rows[0].now);
    }
});

// Universal SMTP Transporter (Supports Gmail, Yahoo, Outlook, and custom domains)
const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: process.env.MAIL_PORT || 587,
    secure: false, // true for 465, false for 587
    auth: {
        user: process.env.MAIL_USER, // System sender email
        pass: process.env.MAIL_PASS, // App password or SMTP credential
    },
});

// ==================== BIG DATA CHUNKING UTILITY ====================
const chunkArray = (array, size) => {
    let result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
};

// ==================== API ENDPOINTS ====================

// Test Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', service: 'Data Flow Portal API - Keezy Technologies' });
});

// Persistent User Registration Endpoint
app.post('/api/register', async (req, res) => {
    const { name, email, password, role, accountType, tenantName } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ error: 'All required fields must be filled.' });
    }

    try {
        // Check if user already exists in PostgreSQL
        const existing = await pool.query('SELECT * FROM portal_users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'An account with this email already exists in the database.' });
        }

        // Insert new user into PostgreSQL portal_users table
        const insertQuery = `
            INSERT INTO portal_users (name, email, password, role, account_type, tenant_name)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const values = [name, email, password, role, accountType, tenantName];
        const newRecord = await pool.query(insertQuery, values);

        res.json({ success: true, user: newRecord.rows[0], message: 'User registered successfully in PostgreSQL.' });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Database registration failed.', details: error.message });
    }
});

// Persistent User Login Authentication Endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const result = await pool.query('SELECT * FROM portal_users WHERE email = $1 AND password = $2', [email, password]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Database authentication failed.', details: error.message });
    }
});

// Universal Password Reset Endpoint for Any User Email (Gmail, Yahoo, Outlook, etc.)
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email address is required.' });
    }

    try {
        const resetToken = Math.random().toString(36).substring(2) + Date.now();
        const resetLink = `http://localhost:5000/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

        const mailOptions = {
            from: `"Data Flow Portal Security" <${process.env.MAIL_USER}>`,
            to: email, // Delivers to any provider domain globally
            subject: 'Password Reset Request - Data Flow Portal',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #4f46e5;">Data Flow Portal Security</h2>
                    <p>Hello,</p>
                    <p>We received a request to reset your password for your enterprise account (${email}).</p>
                    <p>Click the secure button below to update your password:</p>
                    <a href="${resetLink}" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin: 15px 0;">Reset Your Password</a>
                    <p>If you did not request this, please ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 11px; color: #888;">Developed by Keezy Technologies © 2026</p>
                </div>
            `,
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: `Password reset email successfully dispatched to ${email}` });

    } catch (error) {
        console.error('Mail Dispatch Error:', error);
        res.status(500).json({ error: 'Failed to send reset email via SMTP provider.', details: error.message });
    }
});

// High-Performance Bulk Data Ingestion Endpoint
app.post('/api/ingest-bulk', async (req, res) => {
    const { datasetName, tenant, department, rows } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'No data rows provided for ingestion.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const batches = chunkArray(rows, 1000);
        let totalInserted = 0;

        for (let batch of batches) {
            let valuesClause = [];
            let queryParams = [];
            let paramIndex = 1;

            batch.forEach((rowObj) => {
                let rowValues = Object.values(rowObj);
                let placeholders = rowValues.map(() => `$${paramIndex++}`).join(', ');
                valuesClause.push(`(${placeholders})`);
                queryParams.push(...rowValues);
            });

            const columns = Object.keys(rows[0]).join(', ');
            const insertQuery = `INSERT INTO bulk_staging_data (${columns}) VALUES ${valuesClause.join(', ')}`;
            
            await client.query(insertQuery, queryParams);
            totalInserted += batch.length;
        }

        await client.query('COMMIT');
        res.json({ success: true, message: `Successfully ingested ${totalInserted} records across chunks without performance degradation.` });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Bulk Ingestion Error:', error);
        res.status(500).json({ error: 'Database bulk insertion failed.', details: error.message });
    } finally {
        client.release();
    }
});

// Start Express Server
app.listen(PORT, () => {
    console.log(`🚀 Data Flow Portal Backend running live on http://localhost:${PORT}`);
});
