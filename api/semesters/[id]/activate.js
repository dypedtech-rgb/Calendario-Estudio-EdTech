const { execute, logAction } = require('../../_lib/db');
const { getAuthUser, requireAdmin, cors } = require('../../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'PUT') return res.status(405).end();
  const id = parseInt(req.query.id);
  await execute('UPDATE semesters SET is_active = false');
  await execute('UPDATE semesters SET is_active = true WHERE id = ?', [id]);
  await logAction(user, `Activó semestre #${id}`, 'semester', id);
  res.json({ success: true });
};
