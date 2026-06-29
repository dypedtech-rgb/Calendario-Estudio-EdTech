const { queryAll, queryOne } = require('./_lib/db');
const { getAuthUser, requireAuth, cors } = require('./_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;

  const sem = await queryOne('SELECT * FROM semesters WHERE is_active = true');
  if (!sem) return res.json({ semester: null, totalSubjects: 0, completedSubjects: 0, pendingSubjects: 0, inProgressSubjects: 0, nextSession: null, recentSessions: [], inProgressList: [] });

  const totalRow = await queryOne('SELECT COUNT(*) as c FROM subjects WHERE semester_id = ?', [sem.id]);
  const completedRow = await queryOne('SELECT COUNT(*) as c FROM subjects WHERE semester_id = ? AND completed = true', [sem.id]);
  const inProgRow = await queryOne("SELECT COUNT(DISTINCT fa.subject_id) as c FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE s.semester_id = ? AND fa.status = 'in_progress'", [sem.id]);
  const total = parseInt(totalRow?.c || 0);
  const completed = parseInt(completedRow?.c || 0);
  const inProg = parseInt(inProgRow?.c || 0);

  const today = new Date().toISOString().split('T')[0];
  const nextSession = await queryOne(
    "SELECT rs.*, fa.teacher_name, fa.phone, s.code as subject_code, s.name as subject_name FROM recording_sessions rs JOIN filming_assignments fa ON fa.id = rs.assignment_id JOIN subjects s ON s.id = fa.subject_id WHERE rs.session_date >= ? AND fa.status != 'cancelled' ORDER BY rs.session_date ASC, rs.start_time ASC LIMIT 1",
    [today]
  );
  const recentSessions = await queryAll(
    "SELECT rs.*, fa.teacher_name, s.code as subject_code, s.name as subject_name, fa.status as assignment_status FROM recording_sessions rs JOIN filming_assignments fa ON fa.id = rs.assignment_id JOIN subjects s ON s.id = fa.subject_id JOIN semesters sem ON sem.id = s.semester_id AND sem.is_active = true ORDER BY rs.session_date DESC LIMIT 5"
  );
  const inProgressList = await queryAll(
    "SELECT fa.*, s.code as subject_code, s.name as subject_name FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE s.semester_id = ? AND fa.status = 'in_progress' ORDER BY fa.created_at DESC",
    [sem.id]
  );

  res.json({ semester: sem, totalSubjects: total, completedSubjects: completed, pendingSubjects: Math.max(0, total - completed - inProg), inProgressSubjects: inProg, inProgressList, nextSession, recentSessions });
};
