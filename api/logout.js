const { execute } = require('./_lib/db');
const { getToken, cors } = require('./_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = getToken(req);
  if (token) await execute('DELETE FROM user_sessions WHERE token = ?', [token]);
  res.json({ success: true });
};
