const { queryOne, execute } = require('../_lib/db');
const { getAuthUser, requireAuth, cors, extractCodeAndName } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const { subjects, semester_id, replace } = req.body;
  if (!subjects || !semester_id) return res.status(400).json({ error: 'Datos requeridos' });

  let deleted = 0;
  if (replace) {
    const count = await queryOne('SELECT COUNT(*) as c FROM subjects WHERE semester_id = ?', [semester_id]);
    deleted = parseInt(count?.c || 0);
    await execute('DELETE FROM subjects WHERE semester_id = ?', [semester_id]);
  }

  const results = [];
  for (const item of subjects) {
    try {
      let code = item.code?.trim() || null;
      let name = item.name?.trim() || null;
      const subject_type = item.subject_type?.trim() || 'Teórica';
      if (!code) { const ext = extractCodeAndName(name); code = ext.code; name = ext.name; }
      const existing = await queryOne('SELECT id FROM subjects WHERE UPPER(code) = UPPER(?) AND UPPER(name) = UPPER(?) AND semester_id = ?', [code, name, semester_id]);
      if (existing) { results.push({ ...item, skipped: true }); continue; }
      await execute('INSERT INTO subjects (code, name, subject_type, semester_id) VALUES (?, ?, ?, ?)', [code, name, subject_type, semester_id]);
      results.push({ ...item, success: true });
    } catch (e) {
      results.push({ ...item, error: e.message });
    }
  }
  res.status(201).json({ results, deleted });
};
