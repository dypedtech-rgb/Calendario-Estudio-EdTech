const { queryAll } = require('./_lib/db');
const { getAuthUser, requireAuth, cors } = require('./_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const rows = await queryAll("SELECT id, name, role FROM users WHERE role IN ('post_productor', 'admin') ORDER BY name ASC");
  res.json(rows);
};
