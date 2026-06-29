const { execute } = require('../../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  if (req.method !== 'PUT') return res.status(405).end();
  await execute('UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?', [parseInt(req.query.id), user.id]);
  res.json({ success: true });
};
