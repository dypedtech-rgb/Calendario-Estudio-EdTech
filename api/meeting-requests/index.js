const { queryAll } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  if (req.method !== 'GET') return res.status(405).end();
  const { status } = req.query;
  const params = [];
  let q = 'SELECT * FROM meeting_requests';
  if (status) { q += ' WHERE status = ?'; params.push(status); }
  q += ' ORDER BY created_at DESC';
  res.json(await queryAll(q, params));
};
