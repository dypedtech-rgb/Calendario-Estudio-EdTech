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

function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function queryAll(sql, params = []) {
  const client = getPool();
  const { rows } = await client.query(toPostgres(sql), params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

async function execute(sql, params = []) {
  const client = getPool();
  const pgSql = toPostgres(sql);
  const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
  let finalSql = pgSql;
  
  if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
    const tableMatch = pgSql.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : '';
    if (tableName && !['user_sessions', 'settings'].includes(tableName)) {
      finalSql += ' RETURNING id';
    }
  }
  
  const { rows } = await client.query(finalSql, params);
  return isInsert && rows && rows[0] && rows[0].id ? rows[0].id : null;
}

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
