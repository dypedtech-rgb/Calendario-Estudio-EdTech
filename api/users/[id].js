const { queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAdmin, cors } = require('../_lib/auth');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  const id = parseInt(req.query.id);

  if (req.method === 'PUT') {
    const { username, password, role, name } = req.body;
    if (username !== undefined) await execute('UPDATE users SET username = ? WHERE id = ?', [username, id]);
    if (password) await execute('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(password, 10), id]);
    if (role !== undefined) await execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    if (name !== undefined) await execute('UPDATE users SET name = ? WHERE id = ?', [name, id]);
    await logAction(user, `Editó usuario #${id}`, 'user', id);
    return res.json(await queryOne('SELECT id, username, role, name, created_at FROM users WHERE id = ?', [id]));
  }

  if (req.method === 'DELETE') {
    if (id === user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    const u = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
    if (u) await logAction(user, `Eliminó usuario: ${u.name}`, 'user', id);
    await execute('DELETE FROM users WHERE id = ?', [id]);
    return res.json({ success: true });
  }
  res.status(405).end();
};
