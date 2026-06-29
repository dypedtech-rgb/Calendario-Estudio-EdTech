const { queryAll, queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.query.id);

  if (req.method === 'GET') {
    const a = await queryOne('SELECT fa.*, s.code as subject_code, s.name as subject_name FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE fa.id = ?', [id]);
    if (!a) return res.status(404).json({ error: 'No encontrada' });
    a.sessions = await queryAll('SELECT rs.*, u1.name as staff_1_name, u2.name as staff_2_name, u3.name as staff_3_name, u4.name as staff_4_name FROM recording_sessions rs LEFT JOIN users u1 ON rs.staff_1_id = u1.id LEFT JOIN users u2 ON rs.staff_2_id = u2.id LEFT JOIN users u3 ON rs.staff_3_id = u3.id LEFT JOIN users u4 ON rs.staff_4_id = u4.id WHERE rs.assignment_id = ? ORDER BY rs.session_date ASC', [id]);
    return res.json(a);
  }

  if (req.method === 'PUT') {
    const { teacher_name, phone, drive_link, script_status, status, sede, flight_ticket_path, assigned_staff, bitacora } = req.body;
    if (teacher_name !== undefined) await execute('UPDATE filming_assignments SET teacher_name = ? WHERE id = ?', [teacher_name, id]);
    if (phone !== undefined) await execute('UPDATE filming_assignments SET phone = ? WHERE id = ?', [phone, id]);
    if (drive_link !== undefined) await execute('UPDATE filming_assignments SET drive_link = ? WHERE id = ?', [drive_link, id]);
    if (script_status !== undefined) await execute('UPDATE filming_assignments SET script_status = ? WHERE id = ?', [script_status, id]);
    if (sede !== undefined) await execute('UPDATE filming_assignments SET sede = ? WHERE id = ?', [sede, id]);
    if (flight_ticket_path !== undefined) await execute('UPDATE filming_assignments SET flight_ticket_path = ? WHERE id = ?', [flight_ticket_path, id]);
    if (assigned_staff !== undefined) await execute('UPDATE filming_assignments SET assigned_staff = ? WHERE id = ?', [assigned_staff, id]);
    if (bitacora !== undefined) await execute('UPDATE filming_assignments SET bitacora = ? WHERE id = ?', [bitacora, id]);
    if (status !== undefined) {
      await execute('UPDATE filming_assignments SET status = ? WHERE id = ?', [status, id]);
      if (status === 'completed') {
        const a = await queryOne('SELECT subject_id FROM filming_assignments WHERE id = ?', [id]);
        if (a) await execute('UPDATE subjects SET completed = true WHERE id = ?', [a.subject_id]);
      }
    }
    const updated = await queryOne('SELECT fa.*, s.code as subject_code, s.name as subject_name FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE fa.id = ?', [id]);
    const isSilent = (bitacora !== undefined || assigned_staff !== undefined) && status === undefined && teacher_name === undefined;
    if (!isSilent) await logAction(user, status ? `Marcó filmación como: ${status}` : `Editó filmación: ${updated.subject_code}`, 'assignment', id, updated.teacher_name);
    return res.json(updated);
  }

  if (req.method === 'DELETE') {
    const fa = await queryOne('SELECT fa.*, s.code as subject_code FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE fa.id = ?', [id]);
    if (fa) await logAction(user, `Eliminó filmación: ${fa.subject_code} (${fa.teacher_name})`, 'assignment', id);
    await execute('DELETE FROM filming_assignments WHERE id = ?', [id]);
    return res.json({ success: true });
  }
  res.status(405).end();
};
