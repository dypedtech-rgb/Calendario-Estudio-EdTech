const { queryAll, queryOne, execute, logAction } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  if (req.method === 'GET') {
    const { month, year } = req.query;
    let q = "SELECT r.*, u.name as user_name FROM reservations r JOIN users u ON u.id = r.user_id";
    const params = [];
    if (month && year) {
      q += " WHERE EXTRACT(YEAR FROM r.date) = ? AND EXTRACT(MONTH FROM r.date) = ?";
      params.push(parseInt(year), parseInt(month));
    }
    q += " ORDER BY r.date ASC, r.start_time ASC";
    return res.json(await queryAll(q, params));
  }

  if (req.method === 'POST') {
    const { start_date, end_date, start_time, end_time, reason, is_displacement, attendees } = req.body;
    if (!start_date || !end_date || !start_time || !end_time) return res.status(400).json({ error: 'Campos requeridos' });

    const current = new Date(start_date);
    const last = new Date(end_date);
    if (current > last) return res.status(400).json({ error: 'Rango inválido' });

    const d = new Date(current);
    while (d <= last) {
      const dStr = d.toISOString().split('T')[0];
      const exists = await queryOne('SELECT id FROM reservations WHERE user_id = ? AND date = ? AND start_time = ? AND end_time = ?', [user.id, dStr, start_time, end_time]);
      if (!exists) {
        await execute('INSERT INTO reservations (user_id, date, start_time, end_time, reason, is_displacement, attendees) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [user.id, dStr, start_time, end_time, reason || 'Reserva', !!is_displacement, attendees || null]);
      }
      d.setDate(d.getDate() + 1);
    }
    const dispText = is_displacement ? ' (con desplazamiento)' : '';
    await logAction(user, `Reservó fechas: ${start_date} a ${end_date}${dispText}`, 'reservation', null, reason);
    return res.status(201).json({ success: true });
  }
  res.status(405).end();
};
