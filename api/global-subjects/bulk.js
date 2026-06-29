const { execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAdmin, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'POST') return res.status(405).end();
  const { subjects } = req.body;
  if (!subjects || !Array.isArray(subjects)) return res.status(400).json({ error: 'Lista requerida' });
  let inserted = 0, skipped = 0;
  for (const s of subjects) {
    try {
      await execute('INSERT INTO global_subjects (code, name, career) VALUES (?, ?, ?) ON CONFLICT (code, name) DO NOTHING', [s.code, s.name, s.career]);
      inserted++;
    } catch (e) { skipped++; }
  }
  await logAction(user, `Importó ${inserted} materias globales`, 'global_subject');
  res.json({ inserted, skipped });
};
