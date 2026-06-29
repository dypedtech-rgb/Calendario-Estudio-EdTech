const { queryAll } = require('./_lib/db');
const { getAuthUser, requireAdmin, cors } = require('./_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  const limit = parseInt(req.query.limit || 50);
  res.json(await queryAll('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?', [limit]));
};
