const { queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.query.id);
  const resv = await queryOne('SELECT * FROM reservations WHERE id = ?', [id]);
  if (!resv) return res.status(404).json({ error: 'No encontrada' });

  const canEdit = user.role === 'admin' || user.role === 'post_productor' || resv.user_id === user.id;
  if (!canEdit) return res.status(403).json({ error: 'Sin permiso' });

  if (req.method === 'PUT') {
    const { start_date, start_time, end_time, reason, is_displacement, attendees } = req.body;
    if (start_date !== undefined) await execute('UPDATE reservations SET date = ? WHERE id = ?', [start_date, id]);
    if (start_time !== undefined) await execute('UPDATE reservations SET start_time = ? WHERE id = ?', [start_time, id]);
    if (end_time !== undefined) await execute('UPDATE reservations SET end_time = ? WHERE id = ?', [end_time, id]);
    if (reason !== undefined) await execute('UPDATE reservations SET reason = ? WHERE id = ?', [reason, id]);
    if (is_displacement !== undefined) await execute('UPDATE reservations SET is_displacement = ? WHERE id = ?', [!!is_displacement, id]);
    if (attendees !== undefined) await execute('UPDATE reservations SET attendees = ? WHERE id = ?', [attendees, id]);
    await logAction(user, `Editó reserva del ${resv.date}`, 'reservation', id, reason);
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    await logAction(user, `Eliminó reserva del ${resv.date}`, 'reservation', id, resv.reason);
    await execute('DELETE FROM reservations WHERE id = ?', [id]);
    return res.json({ success: true });
  }
  res.status(405).end();
};
