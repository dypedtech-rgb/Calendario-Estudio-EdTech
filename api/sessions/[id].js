const { queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.query.id);

  if (req.method === 'PUT') {
    const body = req.body;
    if (body.session_date !== undefined) await execute('UPDATE recording_sessions SET session_date = ? WHERE id = ?', [body.session_date, id]);
    if (body.start_time !== undefined) await execute('UPDATE recording_sessions SET start_time = ? WHERE id = ?', [body.start_time, id]);
    if (body.end_time !== undefined) await execute('UPDATE recording_sessions SET end_time = ? WHERE id = ?', [body.end_time, id]);
    if (body.hito_reached !== undefined) await execute('UPDATE recording_sessions SET hito_reached = ? WHERE id = ?', [body.hito_reached, id]);
    if (body.notes !== undefined) await execute('UPDATE recording_sessions SET notes = ? WHERE id = ?', [body.notes, id]);
    if ('staff_1_id' in body) await execute('UPDATE recording_sessions SET staff_1_id = ? WHERE id = ?', [body.staff_1_id, id]);
    if ('staff_2_id' in body) await execute('UPDATE recording_sessions SET staff_2_id = ? WHERE id = ?', [body.staff_2_id, id]);
    if ('staff_3_id' in body) await execute('UPDATE recording_sessions SET staff_3_id = ? WHERE id = ?', [body.staff_3_id, id]);
    if ('staff_4_id' in body) await execute('UPDATE recording_sessions SET staff_4_id = ? WHERE id = ?', [body.staff_4_id, id]);
    if (body.status !== undefined) {
      await execute('UPDATE recording_sessions SET status = ? WHERE id = ?', [body.status, id]);
      if (body.status === 'cancelled') {
        const sInfo = await queryOne('SELECT rs.session_date, rs.start_time, rs.end_time, rs.assignment_id, fa.teacher_name, sub.code FROM recording_sessions rs JOIN filming_assignments fa ON fa.id = rs.assignment_id JOIN subjects sub ON sub.id = fa.subject_id WHERE rs.id = ?', [id]);
        if (sInfo) {
          const cancelMsg = `[${sInfo.session_date} ${sInfo.start_time?.substring(0,5)}-${sInfo.end_time?.substring(0,5)}] Sesión CANCELADA — Docente no se presentó.`;
          await logAction(user, `Canceló sesión: ${sInfo.code} (${sInfo.teacher_name}) del ${sInfo.session_date}`, 'session', id);
          const fa = await queryOne('SELECT bitacora FROM filming_assignments WHERE id = ?', [sInfo.assignment_id]);
          const existing = fa?.bitacora || '';
          await execute('UPDATE filming_assignments SET bitacora = ? WHERE id = ?', [existing ? existing + '\n' + cancelMsg : cancelMsg, sInfo.assignment_id]);
        }
      }
    }
    if (body.hito_reached) {
      const s = await queryOne('SELECT assignment_id FROM recording_sessions WHERE id = ?', [id]);
      if (s) await execute('UPDATE filming_assignments SET last_hito_reached = ? WHERE id = ?', [body.hito_reached, s.assignment_id]);
    }
    return res.json(await queryOne('SELECT * FROM recording_sessions WHERE id = ?', [id]));
  }

  if (req.method === 'DELETE') {
    const s = await queryOne('SELECT rs.*, fa.teacher_name, sub.code FROM recording_sessions rs JOIN filming_assignments fa ON fa.id = rs.assignment_id JOIN subjects sub ON sub.id = fa.subject_id WHERE rs.id = ?', [id]);
    if (s) await logAction(user, `Eliminó sesión: ${s.code} (${s.teacher_name}) del ${s.session_date}`, 'session', id);
    await execute('DELETE FROM recording_sessions WHERE id = ?', [id]);
    return res.json({ success: true });
  }
  res.status(405).end();
};
