const { queryAll, queryOne, execute } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.query.id);

  if (req.method === 'PUT') {
    const { code, name, completed } = req.body;
    if (code !== undefined) await execute('UPDATE subjects SET code = ? WHERE id = ?', [code, id]);
    if (name !== undefined) await execute('UPDATE subjects SET name = ? WHERE id = ?', [name, id]);
    if (completed !== undefined) await execute('UPDATE subjects SET completed = ? WHERE id = ?', [!!completed, id]);
    return res.json(await queryOne('SELECT * FROM subjects WHERE id = ?', [id]));
  }

  if (req.method === 'DELETE') {
    const assignments = await queryAll('SELECT id FROM filming_assignments WHERE subject_id = ?', [id]);
    for (const a of assignments) await execute('DELETE FROM recording_sessions WHERE assignment_id = ?', [a.id]);
    await execute('DELETE FROM filming_assignments WHERE subject_id = ?', [id]);
    await execute('DELETE FROM subjects WHERE id = ?', [id]);
    return res.json({ success: true });
  }
  res.status(405).end();
};
