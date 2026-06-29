const { queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAdmin, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  const id = parseInt(req.query.id);

  if (req.method === 'DELETE') {
    const sem = await queryOne('SELECT * FROM semesters WHERE id = ?', [id]);
    if (sem) await logAction(user, `Eliminó semestre: ${sem.name}`, 'semester', id);
    await execute('DELETE FROM subjects WHERE semester_id = ?', [id]);
    await execute('DELETE FROM semesters WHERE id = ?', [id]);
    return res.json({ success: true });
  }
  res.status(405).end();
};
