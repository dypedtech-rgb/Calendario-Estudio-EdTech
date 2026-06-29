const { queryAll, queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAdmin, cors } = require('../_lib/auth');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;

  if (req.method === 'GET') {
    return res.json(await queryAll('SELECT id, username, role, name, created_at FROM users ORDER BY created_at ASC'));
  }

  if (req.method === 'POST') {
    const { username, password, role, name } = req.body;
    if (!username || !password || !role || !name) return res.status(400).json({ error: 'Todos los campos son requeridos' });
    if (!['admin', 'post_productor', 'academica'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
    try {
      const hashed = bcrypt.hashSync(password, 10);
      const id = await execute('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)', [username, hashed, role, name]);
      const u = await queryOne('SELECT id, username, role, name, created_at FROM users WHERE id = ?', [id]);
      await logAction(user, `Creó usuario: ${name} (${role})`, 'user', id);
      return res.status(201).json(u);
    } catch (e) {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }
  }
  res.status(405).end();
};
