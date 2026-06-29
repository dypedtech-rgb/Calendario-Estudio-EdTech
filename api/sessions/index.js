const { queryAll, queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  if (req.method === 'GET') {
    const { month, year } = req.query;
    let q = "SELECT rs.*, fa.teacher_name, fa.phone, fa.subject_id, fa.drive_link, fa.script_status, fa.status as assignment_status, fa.id as assignment_id, fa.sede, s.code as subject_code, s.name as subject_name, s.subject_type, u1.name as staff_1_name, u2.name as staff_2_name, u3.name as staff_3_name, u4.name as staff_4_name FROM recording_sessions rs JOIN filming_assignments fa ON fa.id = rs.assignment_id JOIN subjects s ON s.id = fa.subject_id JOIN semesters sem ON sem.id = s.semester_id AND sem.is_active = true LEFT JOIN users u1 ON rs.staff_1_id = u1.id LEFT JOIN users u2 ON rs.staff_2_id = u2.id LEFT JOIN users u3 ON rs.staff_3_id = u3.id LEFT JOIN users u4 ON rs.staff_4_id = u4.id";
    const params = [];
    if (month && year) {
      q += " WHERE EXTRACT(YEAR FROM rs.session_date) = ? AND EXTRACT(MONTH FROM rs.session_date) = ?";
      params.push(parseInt(year), parseInt(month));
    }
    q += " ORDER BY rs.session_date ASC, rs.start_time ASC";
    return res.json(await queryAll(q, params));
  }

  if (req.method === 'POST') {
    const { assignment_id, session_date, start_time, end_time, hito_reached, notes, staff_1_id, staff_2_id } = req.body;
    if (!assignment_id || !session_date || !start_time || !end_time) return res.status(400).json({ error: 'Campos requeridos' });

    const conflict = await queryOne(
      "SELECT rs.id FROM recording_sessions rs WHERE rs.session_date = ? AND rs.status != 'cancelled' AND ((? >= rs.start_time AND ? < rs.end_time) OR (? > rs.start_time AND ? <= rs.end_time) OR (? <= rs.start_time AND ? >= rs.end_time))",
      [session_date, start_time, start_time, end_time, end_time, start_time, end_time]
    );
    if (conflict) return res.status(409).json({ error: 'Conflicto de horario en ese turno' });

    const sid = await execute(
      'INSERT INTO recording_sessions (assignment_id, session_date, start_time, end_time, hito_reached, notes, staff_1_id, staff_2_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [assignment_id, session_date, start_time, end_time, hito_reached || null, notes || null, staff_1_id || null, staff_2_id || null]
    );

    if (hito_reached) {
      await execute('UPDATE filming_assignments SET last_hito_reached = ? WHERE id = ?', [hito_reached, assignment_id]);
      if (hito_reached === 'semanas') {
        await execute("UPDATE filming_assignments SET status = 'completed' WHERE id = ?", [assignment_id]);
        const a = await queryOne('SELECT subject_id FROM filming_assignments WHERE id = ?', [assignment_id]);
        if (a) await execute('UPDATE subjects SET completed = true WHERE id = ?', [a.subject_id]);
      }
    }

    const fa = await queryOne('SELECT fa.teacher_name, s.code FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE fa.id = ?', [assignment_id]);
    await logAction(user, `Creó sesión: ${fa.code} (${fa.teacher_name}) el ${session_date}`, 'session', sid);
    return res.status(201).json(await queryOne('SELECT * FROM recording_sessions WHERE id = ?', [sid]));
  }
  res.status(405).end();
};
