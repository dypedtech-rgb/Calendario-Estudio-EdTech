const { queryOne, execute } = require('./_lib/db');
const { cors } = require('./_lib/auth');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  
  const { username, password } = req.body;
  const u = await queryOne('SELECT * FROM users WHERE username = ?', [username]);
  if (!u) return res.status(401).json({ error: 'Credenciales inválidas' });

  const passwordOk = bcrypt.compareSync(password, u.password) || u.password === password;
  if (!passwordOk) return res.status(401).json({ error: 'Credenciales inválidas' });

  // If plain text password, hash it now
  if (u.password === password) {
    const hashed = bcrypt.hashSync(password, 10);
    await execute('UPDATE users SET password = ? WHERE id = ?', [hashed, u.id]);
  }

  const token = crypto.randomBytes(32).toString('hex');
  await execute('INSERT INTO user_sessions (token, user_id) VALUES (?, ?)', [token, u.id]);
  res.json({ token, user: { id: u.id, name: u.name, username: u.username, role: u.role } });
};
