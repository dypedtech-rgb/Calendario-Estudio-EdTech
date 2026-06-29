const { queryAll, queryOne, execute } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  if (req.method === 'GET') {
    try {
      const limit = parseInt(req.query.limit || 20);
      const notifications = await queryAll('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [user.id, limit]);
      const row = await queryOne('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = false', [user.id]);
      return res.json({ notifications, unread_count: parseInt(row?.c || 0) });
    } catch (e) {
      return res.json({ notifications: [], unread_count: 0 });
    }
  }

  if (req.method === 'PUT') {
    // PUT /notifications/read-all (path handled by read-all.js, but just in case)
    await execute('UPDATE notifications SET is_read = true WHERE user_id = ?', [user.id]);
    return res.json({ success: true });
  }
  res.status(405).end();
};
