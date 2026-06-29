const { queryAll, queryOne, execute } = require('../_lib/db');
const { getAuthUser, requireAuth, cors, extractCodeAndName } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  if (req.method === 'GET') {
    let semId = req.query.semester_id;
    if (!semId) {
      const active = await queryOne('SELECT id FROM semesters WHERE is_active = true');
      if (!active) return res.json([]);
      semId = active.id;
    }
    return res.json(await queryAll(
      "SELECT s.*, fa.id as assignment_id, fa.status as assignment_status, fa.last_hito_reached, fa.teacher_name, fa.script_status, fa.drive_link FROM subjects s LEFT JOIN filming_assignments fa ON fa.subject_id = s.id AND fa.status != 'cancelled' WHERE s.semester_id = ? ORDER BY s.code ASC",
      [semId]
    ));
  }

  if (req.method === 'POST') {
    let { code, name, semester_id, subject_type } = req.body;
    subject_type = subject_type || 'Teórica';
    if (!name && code) { name = code; code = null; }
    if (!code) { const ext = extractCodeAndName(name); code = ext.code; name = ext.name; }
    if (!name || !semester_id) return res.status(400).json({ error: 'Campos requeridos' });
    const existing = await queryOne('SELECT id FROM subjects WHERE UPPER(code) = UPPER(?) AND UPPER(name) = UPPER(?) AND semester_id = ?', [code, name, semester_id]);
    if (existing) return res.status(409).json({ error: 'Esta materia ya existe en el semestre' });
    const id = await execute('INSERT INTO subjects (code, name, subject_type, semester_id) VALUES (?, ?, ?, ?)', [code, name, subject_type, semester_id]);
    return res.status(201).json(await queryOne('SELECT * FROM subjects WHERE id = ?', [id]));
  }
  res.status(405).end();
};
