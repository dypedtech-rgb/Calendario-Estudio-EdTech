const { queryAll, queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, requireAdmin, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);

  if (req.method === 'GET') {
    if (!requireAuth(user, res)) return;
    return res.json(await queryAll('SELECT * FROM semesters ORDER BY created_at DESC'));
  }

  if (req.method === 'POST') {
    if (!requireAdmin(user, res)) return;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    try {
      await execute('UPDATE semesters SET is_active = false');
      const id = await execute('INSERT INTO semesters (name, is_active) VALUES (?, true)', [name]);
      const sem = await queryOne('SELECT * FROM semesters WHERE id = ?', [id]);
      await logAction(user, `Creó semestre: ${name}`, 'semester', id);
      return res.status(201).json(sem);
    } catch (e) {
      return res.status(409).json({ error: 'Ya existe' });
    }
  }
  res.status(405).end();
};
