const { queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors, extractCodeAndName } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.query.id);

  if (req.method === 'PUT') {
    let { name, subject_code, subject, subject_type, phone, sede, is_external, notes, drive_link, flight_ticket_path, resolved, status } = req.body;
    if (subject !== undefined && subject_code === undefined) { const ext = extractCodeAndName(subject); subject_code = ext.code; subject = ext.name; }
    if (name !== undefined) await execute('UPDATE pending_teachers SET name = ? WHERE id = ?', [name, id]);
    if (subject_code !== undefined) await execute('UPDATE pending_teachers SET subject_code = ? WHERE id = ?', [subject_code, id]);
    if (subject !== undefined) await execute('UPDATE pending_teachers SET subject = ? WHERE id = ?', [subject, id]);
    if (subject_type !== undefined) await execute('UPDATE pending_teachers SET subject_type = ? WHERE id = ?', [subject_type, id]);
    if (phone !== undefined) await execute('UPDATE pending_teachers SET phone = ? WHERE id = ?', [phone, id]);
    if (sede !== undefined) await execute('UPDATE pending_teachers SET sede = ? WHERE id = ?', [sede, id]);
    if (is_external !== undefined) await execute('UPDATE pending_teachers SET is_external = ? WHERE id = ?', [!!is_external, id]);
    if (notes !== undefined) await execute('UPDATE pending_teachers SET notes = ? WHERE id = ?', [notes, id]);
    if (drive_link !== undefined) await execute('UPDATE pending_teachers SET drive_link = ? WHERE id = ?', [drive_link, id]);
    if (flight_ticket_path !== undefined) await execute('UPDATE pending_teachers SET flight_ticket_path = ? WHERE id = ?', [flight_ticket_path, id]);
    if (resolved !== undefined) await execute('UPDATE pending_teachers SET resolved = ? WHERE id = ?', [!!resolved, id]);
    if (status !== undefined) {
      await execute('UPDATE pending_teachers SET status = ? WHERE id = ?', [status, id]);
      await logAction(user, `Cambió estado docente a: ${status}`, 'pending_teacher', id);
      if ((status === 'scheduled' || status === 'contacted') && user) {
        const pt = await queryOne('SELECT * FROM pending_teachers WHERE id = ?', [id]);
        if (pt?.added_by_user_id && pt.added_by_user_id != user.id) {
          const statusLabel = status === 'scheduled' ? 'agendó fecha para' : 'contactó a';
          const msg = `${user.name} ${statusLabel} tu docente ${pt.name} (${pt.subject})`;
          await execute('INSERT INTO notifications (user_id, from_user_id, from_user_name, type, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [pt.added_by_user_id, user.id, user.name, status, msg, 'pending_teacher', id]);
        }
      }
    } else if (resolved !== undefined) {
      await logAction(user, resolved ? 'Marcó docente como resuelto' : 'Reabrió docente', 'pending_teacher', id);
    } else {
      await logAction(user, 'Editó docente pendiente', 'pending_teacher', id, name);
    }
    return res.json(await queryOne('SELECT pt.*, u.name as added_by_name FROM pending_teachers pt LEFT JOIN users u ON u.id = pt.added_by_user_id WHERE pt.id = ?', [id]));
  }

  if (req.method === 'DELETE') {
    const t = await queryOne('SELECT * FROM pending_teachers WHERE id = ?', [id]);
    if (t) await logAction(user, `Eliminó docente pendiente: ${t.name}`, 'pending_teacher', t.id);
    await execute('DELETE FROM pending_teachers WHERE id = ?', [id]);
    return res.json({ success: true });
  }
  res.status(405).end();
};
