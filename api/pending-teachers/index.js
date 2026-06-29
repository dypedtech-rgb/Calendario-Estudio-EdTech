const { queryAll, queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors, extractCodeAndName } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  if (req.method === 'GET') {
    return res.json(await queryAll(
      "SELECT pt.*, u.name as added_by_name FROM pending_teachers pt LEFT JOIN users u ON u.id = pt.added_by_user_id ORDER BY CASE COALESCE(pt.status,'pending') WHEN 'guion_revisado' THEN 1 WHEN 'pending' THEN 2 WHEN 'guion_incompleto' THEN 3 WHEN 'contacted' THEN 4 WHEN 'scheduled' THEN 5 WHEN 'unavailable' THEN 6 ELSE 7 END, pt.created_at ASC"
    ));
  }

  if (req.method === 'POST') {
    let { name, subject_code, subject, subject_type, phone, sede, is_external, notes, drive_link, flight_ticket_path } = req.body;
    if (!name || !subject) return res.status(400).json({ error: 'Nombre y materia son requeridos' });
    if (!subject_code) { const ext = extractCodeAndName(subject); subject_code = ext.code; subject = ext.name; }
    const id = await execute(
      'INSERT INTO pending_teachers (name, subject_code, subject, subject_type, phone, sede, is_external, notes, drive_link, flight_ticket_path, added_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, subject_code, subject, subject_type || 'Teórica', phone, sede || 'La Paz', !!is_external, notes, drive_link, flight_ticket_path, user.id]
    );
    const teacher = await queryOne('SELECT pt.*, u.name as added_by_name FROM pending_teachers pt LEFT JOIN users u ON u.id = pt.added_by_user_id WHERE pt.id = ?', [id]);
    await logAction(user, `Agregó docente pendiente: ${name}`, 'pending_teacher', id, `${subject_code} ${subject}`);
    return res.status(201).json(teacher);
  }
  res.status(405).end();
};
