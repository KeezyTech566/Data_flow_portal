const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large payload limit for enterprise data files
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// PostgreSQL Connection Pool Setup
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'data_flow_portal',
    password: process.env.DB_PASSWORD || 'your_postgres_password',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_HOST && process.env.DB_HOST.includes('supabase') ? { rejectUnauthorized: false } : false
});

// Verify PostgreSQL Connection on Startup
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ PostgreSQL Connection Failed:', err.stack);
    } else {
        console.log('✅ PostgreSQL Connected Successfully at:', res.rows[0].now);
    }
});

// ==================== BIG DATA CHUNKING UTILITY ====================
// Splits massive arrays (millions of records) into controlled batches (e.g., 1,000 rows each)
// to prevent memory exhaustion, request hanging, and database crashes.
const chunkArray = (array, size) => {
    let result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
};

// ==================== API ENDPOINTS ====================

// Test API Route
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', service: 'Data Flow Portal API - Keezy Technologies' });
});

// High-Performance Bulk Data Ingestion Endpoint (Handles Millions of Rows)
app.post('/api/ingest-bulk', async (req, res) => {
    const { datasetName, tenant, department, rows } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'No data rows provided for ingestion.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start transaction for atomic bulk operations

        // 1. Chunk records into safe batches of 1,000 rows per batch
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

        await client.query('COMMIT'); // Commit transaction
        res.json({ success: true, message: `Successfully ingested ${totalInserted} records across chunks without performance degradation.` });

    } catch (error) {
        await client.query('ROLLBACK'); // Rollback transaction on failure
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
