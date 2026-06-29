const { execute } = require('../_lib/db');
const { getAuthUser, requireAdmin, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'DELETE') return res.status(405).end();
  await execute('DELETE FROM global_subjects WHERE id = ?', [parseInt(req.query.id)]);
  res.json({ success: true });
};
