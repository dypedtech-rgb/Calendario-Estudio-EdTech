const { queryOne } = require('./db');

function getToken(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.query && req.query.token) return req.query.token;
  return '';
}

async function getAuthUser(req) {
  const token = getToken(req);
  if (!token) return null;
  const session = await queryOne('SELECT * FROM user_sessions WHERE token = ?', [token]);
  if (!session) return null;
  return queryOne('SELECT id, username, role, name FROM users WHERE id = ?', [session.user_id]);
}

function requireAuth(user, res) {
  if (!user) {
    res.status(401).json({ error: 'No autorizado' });
    return false;
  }
  return true;
}

function requireAdmin(user, res) {
  if (!user) { res.status(401).json({ error: 'No autorizado' }); return false; }
  if (user.role !== 'admin') { res.status(403).json({ error: 'Solo administradores' }); return false; }
  return true;
}

function extractCodeAndName(rawName) {
  if (!rawName) return { code: 'EXT', name: rawName };
  const match = rawName.match(/^([A-Z]{2,4}\d{3,4}[A-Z]?)\s*[-–]?\s*(.+)$/i);
  if (match) return { code: match[1].toUpperCase(), name: match[2].trim() };
  return { code: 'EXT', name: rawName.trim() };
}

module.exports = { getAuthUser, requireAuth, requireAdmin, getToken, extractCodeAndName };
