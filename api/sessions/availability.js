const { queryAll } = require('../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  const year = parseInt(req.query.year || new Date().getFullYear());
  const month = parseInt(req.query.month || (new Date().getMonth() + 1));

  const sessions = await queryAll(
    "SELECT session_date::text, start_time::text, end_time::text FROM recording_sessions WHERE EXTRACT(YEAR FROM session_date) = ? AND EXTRACT(MONTH FROM session_date) = ? AND (status IS NULL OR status != 'cancelled')",
    [year, month]
  );
  const reservations = await queryAll(
    "SELECT date::text as date, start_time::text, end_time::text FROM reservations WHERE EXTRACT(YEAR FROM date) = ? AND EXTRACT(MONTH FROM date) = ?",
    [year, month]
  );

  const result = {};
  const daysInMonth = new Date(year, month, 0).getDate();
  const pad = n => String(n).padStart(2, '0');

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    let morningBusy = false, afternoonBusy = false;

    for (const s of sessions) {
      if (s.session_date !== dateStr) continue;
      const start = s.start_time?.substring(0, 5);
      const end = s.end_time?.substring(0, 5);
      if (start < '13:00') morningBusy = true;
      if (end > '13:00') afternoonBusy = true;
    }
    for (const r of reservations) {
      if (r.date !== dateStr) continue;
      const start = r.start_time?.substring(0, 5);
      const end = r.end_time?.substring(0, 5);
      if (start < '13:00') morningBusy = true;
      if (end > '13:00') afternoonBusy = true;
    }

    if (morningBusy && afternoonBusy) result[dateStr] = 'full';
    else if (morningBusy) result[dateStr] = 'morning_busy';
    else if (afternoonBusy) result[dateStr] = 'afternoon_busy';
  }
  res.json(result);
};
