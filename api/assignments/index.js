const { queryAll, queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  if (req.method === 'GET') {
    return res.json(await queryAll("SELECT fa.*, s.code as subject_code, s.name as subject_name FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id JOIN semesters sem ON sem.id = s.semester_id AND sem.is_active = true ORDER BY fa.created_at DESC"));
  }

  if (req.method === 'POST') {
    const { teacher_name, phone, subject_id, drive_link, script_status, session, sede, flight_ticket_path, pending_teacher_id } = req.body;
    const staff_1_id = req.body.staff_1_id;
    const staff_2_id = req.body.staff_2_id;
    if (!teacher_name || !subject_id) return res.status(400).json({ error: 'Docente y materia requeridos' });

    const aid = await execute(
      'INSERT INTO filming_assignments (teacher_name, phone, subject_id, drive_link, script_status, sede, flight_ticket_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [teacher_name, phone, subject_id, drive_link, script_status || 'not_uploaded', sede || 'La Paz', flight_ticket_path]
    );

    if (session?.session_date && session?.start_time && session?.end_time) {
      const sid = await execute(
        'INSERT INTO recording_sessions (assignment_id, session_date, start_time, end_time, hito_reached, notes, staff_1_id, staff_2_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [aid, session.session_date, session.start_time, session.end_time, session.hito_reached || null, session.notes || null, staff_1_id, staff_2_id]
      );
      if (session.hito_reached) await execute('UPDATE filming_assignments SET last_hito_reached = ? WHERE id = ?', [session.hito_reached, aid]);
    }

    const result = await queryOne('SELECT fa.*, s.code as subject_code, s.name as subject_name FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE fa.id = ?', [aid]);
    await logAction(user, `Creó filmación: ${result.subject_code} (${teacher_name})`, 'assignment', aid, session?.session_date ? `Fecha: ${session.session_date}` : null);

    if (pending_teacher_id) {
      const pt = await queryOne('SELECT * FROM pending_teachers WHERE id = ?', [pending_teacher_id]);
      if (pt?.added_by_user_id && pt.added_by_user_id != user.id) {
        const sessionDate = session?.session_date || 'fecha por definir';
        const msg = `${user.name} agendó filmación de ${teacher_name} (${result.subject_code}) para el ${sessionDate}`;
        await execute('INSERT INTO notifications (user_id, from_user_id, from_user_name, type, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [pt.added_by_user_id, user.id, user.name, 'scheduled', msg, 'assignment', aid]);
      }
    }

    return res.status(201).json(result);
  }
  res.status(405).end();
};
