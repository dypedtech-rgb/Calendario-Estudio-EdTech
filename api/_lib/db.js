const { Pool } = require('pg');

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

// Convert MySQL-style ? placeholders to PostgreSQL $1, $2, ...
function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Execute a query returning all rows
async function queryAll(sql, params = []) {
  const client = getPool();
  const { rows } = await client.query(toPostgres(sql), params);
  return rows;
}

// Execute a query returning one row or null
async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

// Execute INSERT/UPDATE/DELETE — returns insertId for INSERT
async function execute(sql, params = []) {
  const client = getPool();
  const pgSql = toPostgres(sql);
  // For INSERT, append RETURNING id to get the new ID
  const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
  const finalSql = isInsert && !pgSql.toUpperCase().includes('RETURNING')
    ? pgSql + ' RETURNING id'
    : pgSql;
  const { rows } = await client.query(finalSql, params);
  return isInsert && rows[0] ? rows[0].id : null;
}

// Log an action to activity_log
async function logAction(user, action, entityType = null, entityId = null, details = null) {
  if (!user) return;
  try {
    await execute(
      'INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, user.name, action, entityType, entityId, details]
    );
  } catch (e) { /* non-critical */ }
}

module.exports = { queryAll, queryOne, execute, logAction };
