const { queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  if (req.method !== 'PUT') return res.status(405).end();

  const id = parseInt(req.query.id);
  const { status, admin_notes } = req.body;
  const mr = await queryOne('SELECT * FROM meeting_requests WHERE id = ?', [id]);
  if (!mr) return res.status(404).json({ error: 'No encontrada' });

  await execute('UPDATE meeting_requests SET status = ?, admin_notes = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE id = ?',
    [status, admin_notes || null, user.id, id]);

  if (status === 'approved') {
    // Create a reservation from the approved meeting request
    await execute(
      'INSERT INTO reservations (user_id, date, start_time, end_time, reason, is_displacement) VALUES (?, ?, ?, ?, ?, false)',
      [user.id, mr.requested_date, mr.start_time, mr.end_time, `Reunión: ${mr.requester_name}`]
    );
  }

  await logAction(user, `${status === 'approved' ? 'Aprobó' : 'Rechazó'} solicitud de reunión de ${mr.requester_name}`, 'meeting_request', id);
  res.json({ success: true });
};
