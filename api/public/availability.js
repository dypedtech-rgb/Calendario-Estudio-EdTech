const { queryAll, queryOne } = require('../_lib/db');
const { cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const year = parseInt(req.query.year || new Date().getFullYear());
  const month = parseInt(req.query.month || (new Date().getMonth() + 1));
  const pad = n => String(n).padStart(2, '0');
  const monthStr = `${year}-${pad(month)}`;

  const stRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_start_time'");
  const etRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_end_time'");
  const daysRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_days'");

  const studioStart = stRow?.value || '08:00';
  const studioEnd = etRow?.value || '18:00';
  const workDays = (daysRow?.value || '1,2,3,4,5').split(',').map(Number);

  const sessions = await queryAll(
    "SELECT session_date::text, start_time::text, end_time::text FROM recording_sessions WHERE EXTRACT(YEAR FROM session_date) = ? AND EXTRACT(MONTH FROM session_date) = ? AND (status IS NULL OR status != 'cancelled')",
    [year, month]
  );
  const reservations = await queryAll(
    "SELECT date::text as date, start_time::text, end_time::text FROM reservations WHERE is_displacement = false AND EXTRACT(YEAR FROM date) = ? AND EXTRACT(MONTH FROM date) = ?",
    [year, month]
  );
  const closedWeeks = await queryAll('SELECT week_start::text FROM closed_weeks');
  const meetingRequests = await queryAll(
    "SELECT requested_date::text, start_time, end_time FROM meeting_requests WHERE status = 'pending' AND EXTRACT(YEAR FROM requested_date) = ? AND EXTRACT(MONTH FROM requested_date) = ?",
    [year, month]
  );

  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split('T')[0];
  const availability = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const d = new Date(dateStr);
    const dow = d.getDay() === 0 ? 7 : d.getDay(); // Monday=1 ... Sunday=7

    // Check if it's a work day
    if (!workDays.includes(dow)) {
      availability.push({ date: dateStr, status: 'closed' });
      continue;
    }

    // Check if in a closed week
    const mondayOffset = dow === 1 ? 0 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const mondayStr = monday.toISOString().split('T')[0];
    if (closedWeeks.some(cw => cw.week_start === mondayStr)) {
      availability.push({ date: dateStr, status: 'closed', reason: 'Semana cerrada' });
      continue;
    }

    const daySessions = sessions.filter(s => s.session_date === dateStr);
    const dayReservations = reservations.filter(r => r.date === dateStr);
    const dayMR = meetingRequests.filter(mr => mr.requested_date === dateStr);

    // Build busy intervals
    const busyIntervals = [
      ...daySessions.map(s => ({ start: s.start_time?.substring(0, 5), end: s.end_time?.substring(0, 5) })),
      ...dayReservations.map(r => ({ start: r.start_time?.substring(0, 5), end: r.end_time?.substring(0, 5) })),
    ];

    // Find free slots between studio hours
    const startH = parseInt(studioStart.split(':')[0]);
    const endH = parseInt(studioEnd.split(':')[0]);
    const allSlots = [];
    for (let h = startH; h < endH; h++) {
      const ss = `${pad(h)}:00`;
      const se = `${pad(h+1)}:00`;
      const busy = busyIntervals.some(b => !(se <= b.start || ss >= b.end));
      if (!busy) allSlots.push({ start: ss, end: se });
    }

    if (allSlots.length === 0) {
      availability.push({ date: dateStr, status: 'occupied' });
    } else if (allSlots.length === endH - startH) {
      availability.push({ date: dateStr, status: 'available', start_time: studioStart, end_time: studioEnd, pending_meetings: dayMR.length });
    } else {
      // Merge consecutive slots
      const merged = [];
      for (const slot of allSlots) {
        if (merged.length && merged[merged.length-1].end === slot.start) {
          merged[merged.length-1].end = slot.end;
        } else {
          merged.push({ ...slot });
        }
      }
      availability.push({ date: dateStr, status: 'partial', free_slots: merged, pending_meetings: dayMR.length });
    }
  }

  res.json({ month, year, studio_hours: { start: studioStart, end: studioEnd }, work_days: workDays, availability });
};
