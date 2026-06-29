const { queryAll, queryOne, execute } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  if (req.method === 'GET') return res.json(await queryAll('SELECT * FROM closed_weeks ORDER BY week_start DESC'));

  if (req.method === 'POST') {
    const { week_start, reason } = req.body;
    if (!week_start) return res.status(400).json({ error: 'Fecha requerida' });
    try {
      await execute('INSERT INTO closed_weeks (week_start, reason) VALUES (?, ?)', [week_start, reason || 'Estudio cerrado']);
      return res.status(201).json(await queryOne('SELECT * FROM closed_weeks ORDER BY id DESC LIMIT 1'));
    } catch (e) {
      return res.status(409).json({ error: 'Semana ya cerrada' });
    }
  }
  res.status(405).end();
};
