const { queryAll, queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, requireAdmin, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  if (req.method === 'GET') {
    const q = req.query.q;
    if (q) {
      const like = `%${q}%`;
      return res.json(await queryAll('SELECT * FROM global_subjects WHERE code ILIKE ? OR name ILIKE ? ORDER BY code ASC LIMIT 50', [like, like]));
    }
    return res.json(await queryAll('SELECT * FROM global_subjects ORDER BY code ASC'));
  }

  if (req.method === 'POST') {
    if (!requireAdmin(user, res)) return;
    const { code, name, career } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Código y nombre requeridos' });
    try {
      const id = await execute('INSERT INTO global_subjects (code, name, career) VALUES (?, ?, ?)', [code, name, career]);
      await logAction(user, `Agregó materia global: ${code} - ${name}`, 'global_subject', id);
      return res.status(201).json(await queryOne('SELECT * FROM global_subjects WHERE id = ?', [id]));
    } catch (e) {
      return res.status(409).json({ error: 'Esa materia ya existe' });
    }
  }
  res.status(405).end();
};
