const { queryAll, queryOne } = require('../../_lib/db');
const { getAuthUser, requireAuth, cors } = require('../../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  const date = req.query.date;
  const d = new Date(date + 'T12:00:00');
  const dow = d.getDay();
  const monOff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d);
  mon.setDate(d.getDate() + monOff);
  const monStr = mon.toISOString().split('T')[0];

  const closed = await queryOne('SELECT * FROM closed_weeks WHERE week_start = ?', [monStr]);
  if (closed) return res.json({ closed: true, reason: closed.reason, slots: [] });

  const stRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_start_time'");
  const etRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_end_time'");
  const startH = parseInt((stRow?.value || '08:00').split(':')[0]);
  const endH = parseInt((etRow?.value || '18:00').split(':')[0]);

  const existing = await queryAll(
    "SELECT rs.start_time::text, rs.end_time::text, fa.teacher_name, s.code as subject_code FROM recording_sessions rs JOIN filming_assignments fa ON fa.id = rs.assignment_id JOIN subjects s ON s.id = fa.subject_id WHERE rs.session_date = ? ORDER BY rs.start_time ASC",
    [date]
  );

  const slots = [];
  const pad = n => String(n).padStart(2, '0');
  for (let h = startH; h < endH; h++) {
    const ss = `${pad(h)}:00`;
    const se = `${pad(h+1)}:00`;
    const occ = existing.find(s => {
      const st = s.start_time?.substring(0,5);
      const et = s.end_time?.substring(0,5);
      return (ss >= st && ss < et) || (se > st && se <= et);
    });
    slots.push({ start: ss, end: se, available: !occ, session: occ || null });
  }
  res.json({ closed: false, slots, existingSessions: existing });
};
