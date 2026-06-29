const { queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  if (req.method !== 'POST') return res.status(405).end();
  const { semester_id } = req.body;
  if (!semester_id) return res.status(400).json({ error: 'semester_id requerido' });
  const count = await queryOne('SELECT COUNT(*) as c FROM subjects WHERE semester_id = ?', [semester_id]);
  await execute('DELETE FROM subjects WHERE semester_id = ?', [semester_id]);
  await logAction(user, `Eliminó todas las materias del semestre #${semester_id}`, 'subject');
  res.json({ success: true, deleted: parseInt(count?.c || 0) });
};
