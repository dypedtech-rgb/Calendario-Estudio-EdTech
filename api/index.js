const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { queryAll, queryOne, execute, logAction } = require('../src/db');
const { getAuthUser, requireAuth, requireAdmin, getToken, extractCodeAndName } = require('../src/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- AUTH & ME ---
app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const u = await queryOne('SELECT * FROM users WHERE username = ?', [username]);
  if (!u) return res.status(401).json({ error: 'Credenciales inválidas' });
  const passwordOk = bcrypt.compareSync(password, u.password) || u.password === password;
  if (!passwordOk) return res.status(401).json({ error: 'Credenciales inválidas' });
  if (u.password === password) {
    await execute('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(password, 10), u.id]);
  }
  const token = crypto.randomBytes(32).toString('hex');
  await execute('INSERT INTO user_sessions (token, user_id) VALUES (?, ?)', [token, u.id]);
  res.json({ token, user: { id: u.id, name: u.name, username: u.username, role: u.role } });
}));

app.get('/api/logout', asyncHandler(async (req, res) => {
  const token = getToken(req);
  if (token) await execute('DELETE FROM user_sessions WHERE token = ?', [token]);
  res.json({ success: true });
}));

app.get('/api/me', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });
  res.json(user);
}));

app.get('/api/staff', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const rows = await queryAll("SELECT id, name, role FROM users WHERE role IN ('post_productor', 'admin') ORDER BY name ASC");
  res.json(rows);
}));

// --- DASHBOARD ---
app.get('/api/dashboard', asyncHandler(async (req, res) => {
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
}));

// --- SEMESTERS ---
app.get('/api/semesters', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  res.json(await queryAll('SELECT * FROM semesters ORDER BY created_at DESC'));
}));
app.post('/api/semesters', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    await execute('UPDATE semesters SET is_active = false');
    const id = await execute('INSERT INTO semesters (name, is_active) VALUES (?, true)', [name]);
    await logAction(user, `Creó semestre: ${name}`, 'semester', id);
    res.status(201).json(await queryOne('SELECT * FROM semesters WHERE id = ?', [id]));
  } catch (e) { res.status(409).json({ error: 'Ya existe' }); }
}));
app.put('/api/semesters/:id/activate', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  const id = parseInt(req.params.id);
  await execute('UPDATE semesters SET is_active = false');
  await execute('UPDATE semesters SET is_active = true WHERE id = ?', [id]);
  await logAction(user, `Activó semestre #${id}`, 'semester', id);
  res.json({ success: true });
}));
app.delete('/api/semesters/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  const id = parseInt(req.params.id);
  const sem = await queryOne('SELECT * FROM semesters WHERE id = ?', [id]);
  if (sem) await logAction(user, `Eliminó semestre: ${sem.name}`, 'semester', id);
  await execute('DELETE FROM subjects WHERE semester_id = ?', [id]);
  await execute('DELETE FROM semesters WHERE id = ?', [id]);
  res.json({ success: true });
}));

// --- SUBJECTS ---
app.get('/api/subjects', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  let semId = req.query.semester_id;
  if (!semId) {
    const active = await queryOne('SELECT id FROM semesters WHERE is_active = true');
    if (!active) return res.json([]);
    semId = active.id;
  }
  res.json(await queryAll("SELECT s.*, fa.id as assignment_id, fa.status as assignment_status, fa.last_hito_reached, fa.teacher_name, fa.script_status, fa.drive_link FROM subjects s LEFT JOIN filming_assignments fa ON fa.subject_id = s.id AND fa.status != 'cancelled' WHERE s.semester_id = ? ORDER BY s.code ASC", [semId]));
}));
app.post('/api/subjects', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  let { code, name, semester_id, subject_type } = req.body;
  if (!name && code) { name = code; code = null; }
  if (!code) { const ext = extractCodeAndName(name); code = ext.code; name = ext.name; }
  if (!name || !semester_id) return res.status(400).json({ error: 'Campos requeridos' });
  const existing = await queryOne('SELECT id FROM subjects WHERE UPPER(code) = UPPER(?) AND UPPER(name) = UPPER(?) AND semester_id = ?', [code, name, semester_id]);
  if (existing) return res.status(409).json({ error: 'Esta materia ya existe en el semestre' });
  const id = await execute('INSERT INTO subjects (code, name, subject_type, semester_id) VALUES (?, ?, ?, ?)', [code, name, subject_type || 'Teórica', semester_id]);
  res.status(201).json(await queryOne('SELECT * FROM subjects WHERE id = ?', [id]));
}));
app.post('/api/subjects/bulk', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const { subjects, semester_id, replace } = req.body;
  let deleted = 0;
  if (replace) {
    const count = await queryOne('SELECT COUNT(*) as c FROM subjects WHERE semester_id = ?', [semester_id]);
    deleted = parseInt(count?.c || 0);
    await execute('DELETE FROM subjects WHERE semester_id = ?', [semester_id]);
  }
  const results = [];
  for (const item of subjects) {
    try {
      let code = item.code?.trim() || null;
      let name = item.name?.trim() || null;
      if (!code) { const ext = extractCodeAndName(name); code = ext.code; name = ext.name; }
      const existing = await queryOne('SELECT id FROM subjects WHERE UPPER(code) = UPPER(?) AND UPPER(name) = UPPER(?) AND semester_id = ?', [code, name, semester_id]);
      if (existing) { results.push({ ...item, skipped: true }); continue; }
      await execute('INSERT INTO subjects (code, name, subject_type, semester_id) VALUES (?, ?, ?, ?)', [code, name, item.subject_type || 'Teórica', semester_id]);
      results.push({ ...item, success: true });
    } catch (e) { results.push({ ...item, error: e.message }); }
  }
  res.status(201).json({ results, deleted });
}));
app.post('/api/subjects/bulk-delete', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const { semester_id } = req.body;
  const count = await queryOne('SELECT COUNT(*) as c FROM subjects WHERE semester_id = ?', [semester_id]);
  await execute('DELETE FROM subjects WHERE semester_id = ?', [semester_id]);
  await logAction(user, `Eliminó todas las materias del semestre #${semester_id}`, 'subject');
  res.json({ success: true, deleted: parseInt(count?.c || 0) });
}));
app.put('/api/subjects/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
  const { code, name, completed } = req.body;
  if (code !== undefined) await execute('UPDATE subjects SET code = ? WHERE id = ?', [code, id]);
  if (name !== undefined) await execute('UPDATE subjects SET name = ? WHERE id = ?', [name, id]);
  if (completed !== undefined) await execute('UPDATE subjects SET completed = ? WHERE id = ?', [!!completed, id]);
  res.json(await queryOne('SELECT * FROM subjects WHERE id = ?', [id]));
}));
app.delete('/api/subjects/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
  const assignments = await queryAll('SELECT id FROM filming_assignments WHERE subject_id = ?', [id]);
  for (const a of assignments) await execute('DELETE FROM recording_sessions WHERE assignment_id = ?', [a.id]);
  await execute('DELETE FROM filming_assignments WHERE subject_id = ?', [id]);
  await execute('DELETE FROM subjects WHERE id = ?', [id]);
  res.json({ success: true });
}));

// --- ASSIGNMENTS ---
app.get('/api/assignments', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  res.json(await queryAll("SELECT fa.*, s.code as subject_code, s.name as subject_name FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id JOIN semesters sem ON sem.id = s.semester_id AND sem.is_active = true ORDER BY fa.created_at DESC"));
}));
app.post('/api/assignments', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const { teacher_name, phone, subject_id, drive_link, script_status, session, sede, flight_ticket_path, pending_teacher_id } = req.body;
  const aid = await execute(
    'INSERT INTO filming_assignments (teacher_name, phone, subject_id, drive_link, script_status, sede, flight_ticket_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [teacher_name, phone, subject_id, drive_link, script_status || 'not_uploaded', sede || 'La Paz', flight_ticket_path]
  );
  if (session?.session_date && session?.start_time && session?.end_time) {
    await execute('INSERT INTO recording_sessions (assignment_id, session_date, start_time, end_time, hito_reached, notes, staff_1_id, staff_2_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [aid, session.session_date, session.start_time, session.end_time, session.hito_reached || null, session.notes || null, req.body.staff_1_id, req.body.staff_2_id]);
    if (session.hito_reached) await execute('UPDATE filming_assignments SET last_hito_reached = ? WHERE id = ?', [session.hito_reached, aid]);
  }
  const result = await queryOne('SELECT fa.*, s.code as subject_code, s.name as subject_name FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE fa.id = ?', [aid]);
  await logAction(user, `Creó filmación: ${result.subject_code} (${teacher_name})`, 'assignment', aid, session?.session_date ? `Fecha: ${session.session_date}` : null);
  
  if (pending_teacher_id) {
    const pt = await queryOne('SELECT * FROM pending_teachers WHERE id = ?', [pending_teacher_id]);
    if (pt?.added_by_user_id && pt.added_by_user_id != user.id) {
      await execute('INSERT INTO notifications (user_id, from_user_id, from_user_name, type, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [pt.added_by_user_id, user.id, user.name, 'scheduled', `${user.name} agendó filmación de ${teacher_name}`, 'assignment', aid]);
    }
  }
  res.status(201).json(result);
}));
app.get('/api/assignments/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
  const a = await queryOne('SELECT fa.*, s.code as subject_code, s.name as subject_name FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE fa.id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'No encontrada' });
  a.sessions = await queryAll('SELECT rs.*, u1.name as staff_1_name, u2.name as staff_2_name, u3.name as staff_3_name, u4.name as staff_4_name FROM recording_sessions rs LEFT JOIN users u1 ON rs.staff_1_id = u1.id LEFT JOIN users u2 ON rs.staff_2_id = u2.id LEFT JOIN users u3 ON rs.staff_3_id = u3.id LEFT JOIN users u4 ON rs.staff_4_id = u4.id WHERE rs.assignment_id = ? ORDER BY rs.session_date ASC', [id]);
  res.json(a);
}));
app.put('/api/assignments/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
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
  if (status !== undefined || teacher_name !== undefined) await logAction(user, status ? `Marcó filmación como: ${status}` : `Editó filmación: ${updated.subject_code}`, 'assignment', id, updated.teacher_name);
  res.json(updated);
}));
app.delete('/api/assignments/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
  const fa = await queryOne('SELECT fa.*, s.code as subject_code FROM filming_assignments fa JOIN subjects s ON s.id = fa.subject_id WHERE fa.id = ?', [id]);
  if (fa) await logAction(user, `Eliminó filmación: ${fa.subject_code} (${fa.teacher_name})`, 'assignment', id);
  await execute('DELETE FROM filming_assignments WHERE id = ?', [id]);
  res.json({ success: true });
}));

// --- SESSIONS ---
app.get('/api/sessions', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const { month, year } = req.query;
  let q = "SELECT rs.*, fa.teacher_name, fa.phone, fa.subject_id, fa.drive_link, fa.script_status, fa.status as assignment_status, fa.id as assignment_id, fa.sede, s.code as subject_code, s.name as subject_name, s.subject_type, u1.name as staff_1_name, u2.name as staff_2_name, u3.name as staff_3_name, u4.name as staff_4_name FROM recording_sessions rs JOIN filming_assignments fa ON fa.id = rs.assignment_id JOIN subjects s ON s.id = fa.subject_id JOIN semesters sem ON sem.id = s.semester_id AND sem.is_active = true LEFT JOIN users u1 ON rs.staff_1_id = u1.id LEFT JOIN users u2 ON rs.staff_2_id = u2.id LEFT JOIN users u3 ON rs.staff_3_id = u3.id LEFT JOIN users u4 ON rs.staff_4_id = u4.id";
  const params = [];
  if (month && year) {
    q += " WHERE EXTRACT(YEAR FROM rs.session_date) = ? AND EXTRACT(MONTH FROM rs.session_date) = ?";
    params.push(parseInt(year), parseInt(month));
  }
  q += " ORDER BY rs.session_date ASC, rs.start_time ASC";
  res.json(await queryAll(q, params));
}));
app.get('/api/sessions/availability', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const year = parseInt(req.query.year || new Date().getFullYear());
  const month = parseInt(req.query.month || (new Date().getMonth() + 1));
  const sessions = await queryAll("SELECT session_date::text, start_time::text, end_time::text FROM recording_sessions WHERE EXTRACT(YEAR FROM session_date) = ? AND EXTRACT(MONTH FROM session_date) = ? AND (status IS NULL OR status != 'cancelled')", [year, month]);
  const reservations = await queryAll("SELECT date::text as date, start_time::text, end_time::text FROM reservations WHERE EXTRACT(YEAR FROM date) = ? AND EXTRACT(MONTH FROM date) = ?", [year, month]);
  const result = {};
  const pad = n => String(n).padStart(2, '0');
  for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    let morningBusy = false, afternoonBusy = false;
    [...sessions, ...reservations.map(r => ({ session_date: r.date, start_time: r.start_time, end_time: r.end_time }))].forEach(s => {
      if (s.session_date !== dateStr) return;
      if (s.start_time?.substring(0,5) < '13:00') morningBusy = true;
      if (s.end_time?.substring(0,5) > '13:00') afternoonBusy = true;
    });
    if (morningBusy && afternoonBusy) result[dateStr] = 'full';
    else if (morningBusy) result[dateStr] = 'morning_busy';
    else if (afternoonBusy) result[dateStr] = 'afternoon_busy';
  }
  res.json(result);
}));
app.post('/api/sessions', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const { assignment_id, session_date, start_time, end_time, hito_reached, notes, staff_1_id, staff_2_id } = req.body;
  const conflict = await queryOne(
    "SELECT rs.id FROM recording_sessions rs WHERE rs.session_date = ? AND rs.status != 'cancelled' AND ((? >= rs.start_time AND ? < rs.end_time) OR (? > rs.start_time AND ? <= rs.end_time) OR (? <= rs.start_time AND ? >= rs.end_time))",
    [session_date, start_time, start_time, end_time, end_time, start_time, end_time]
  );
  if (conflict) return res.status(409).json({ error: 'Conflicto de horario' });
  const sid = await execute('INSERT INTO recording_sessions (assignment_id, session_date, start_time, end_time, hito_reached, notes, staff_1_id, staff_2_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [assignment_id, session_date, start_time, end_time, hito_reached || null, notes || null, staff_1_id || null, staff_2_id || null]);
  if (hito_reached) {
    await execute('UPDATE filming_assignments SET last_hito_reached = ? WHERE id = ?', [hito_reached, assignment_id]);
    if (hito_reached === 'semanas') {
      await execute("UPDATE filming_assignments SET status = 'completed' WHERE id = ?", [assignment_id]);
      const a = await queryOne('SELECT subject_id FROM filming_assignments WHERE id = ?', [assignment_id]);
      if (a) await execute('UPDATE subjects SET completed = true WHERE id = ?', [a.subject_id]);
    }
  }
  res.status(201).json(await queryOne('SELECT * FROM recording_sessions WHERE id = ?', [sid]));
}));
app.put('/api/sessions/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
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
        const fa = await queryOne('SELECT bitacora FROM filming_assignments WHERE id = ?', [sInfo.assignment_id]);
        await execute('UPDATE filming_assignments SET bitacora = ? WHERE id = ?', [fa?.bitacora ? fa.bitacora + '\n' + cancelMsg : cancelMsg, sInfo.assignment_id]);
      }
    }
  }
  res.json(await queryOne('SELECT * FROM recording_sessions WHERE id = ?', [id]));
}));
app.delete('/api/sessions/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
  await execute('DELETE FROM recording_sessions WHERE id = ?', [id]);
  res.json({ success: true });
}));

// --- RESERVATIONS ---
app.get('/api/reservations', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const { month, year } = req.query;
  let q = "SELECT r.*, u.name as user_name FROM reservations r JOIN users u ON u.id = r.user_id";
  const params = [];
  if (month && year) {
    q += " WHERE EXTRACT(YEAR FROM r.date) = ? AND EXTRACT(MONTH FROM r.date) = ?";
    params.push(parseInt(year), parseInt(month));
  }
  q += " ORDER BY r.date ASC, r.start_time ASC";
  res.json(await queryAll(q, params));
}));
app.post('/api/reservations', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const { start_date, end_date, start_time, end_time, reason, is_displacement, attendees } = req.body;
  const current = new Date(start_date);
  const last = new Date(end_date);
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
  res.status(201).json({ success: true });
}));
app.put('/api/reservations/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
  const { start_date, start_time, end_time, reason, is_displacement, attendees } = req.body;
  if (start_date !== undefined) await execute('UPDATE reservations SET date = ? WHERE id = ?', [start_date, id]);
  if (start_time !== undefined) await execute('UPDATE reservations SET start_time = ? WHERE id = ?', [start_time, id]);
  if (end_time !== undefined) await execute('UPDATE reservations SET end_time = ? WHERE id = ?', [end_time, id]);
  if (reason !== undefined) await execute('UPDATE reservations SET reason = ? WHERE id = ?', [reason, id]);
  if (is_displacement !== undefined) await execute('UPDATE reservations SET is_displacement = ? WHERE id = ?', [!!is_displacement, id]);
  if (attendees !== undefined) await execute('UPDATE reservations SET attendees = ? WHERE id = ?', [attendees, id]);
  res.json({ success: true });
}));
app.delete('/api/reservations/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  await execute('DELETE FROM reservations WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
}));

// --- USERS ---
app.get('/api/users', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  res.json(await queryAll('SELECT id, username, role, name, created_at FROM users ORDER BY created_at ASC'));
}));
app.post('/api/users', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  const { username, password, role, name } = req.body;
  try {
    const id = await execute('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)', [username, bcrypt.hashSync(password, 10), role, name]);
    res.status(201).json(await queryOne('SELECT id, username, role, name, created_at FROM users WHERE id = ?', [id]));
  } catch (e) { res.status(409).json({ error: 'El usuario ya existe' }); }
}));
app.put('/api/users/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  const id = parseInt(req.params.id);
  const { username, password, role, name } = req.body;
  if (username !== undefined) await execute('UPDATE users SET username = ? WHERE id = ?', [username, id]);
  if (password) await execute('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(password, 10), id]);
  if (role !== undefined) await execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  if (name !== undefined) await execute('UPDATE users SET name = ? WHERE id = ?', [name, id]);
  res.json(await queryOne('SELECT id, username, role, name, created_at FROM users WHERE id = ?', [id]));
}));
app.delete('/api/users/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  const id = parseInt(req.params.id);
  if (id === user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  await execute('DELETE FROM users WHERE id = ?', [id]);
  res.json({ success: true });
}));

// --- CLOSED WEEKS ---
app.get('/api/closed-weeks', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  res.json(await queryAll('SELECT * FROM closed_weeks ORDER BY week_start DESC'));
}));
app.post('/api/closed-weeks', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  try {
    await execute('INSERT INTO closed_weeks (week_start, reason) VALUES (?, ?)', [req.body.week_start, req.body.reason || 'Estudio cerrado']);
    res.status(201).json(await queryOne('SELECT * FROM closed_weeks ORDER BY id DESC LIMIT 1'));
  } catch (e) { res.status(409).json({ error: 'Semana ya cerrada' }); }
}));
app.delete('/api/closed-weeks/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  await execute('DELETE FROM closed_weeks WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
}));

// --- NOTIFICATIONS ---
app.get('/api/notifications', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  try {
    const limit = parseInt(req.query.limit || 20);
    const notifications = await queryAll('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [user.id, limit]);
    const row = await queryOne('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = false', [user.id]);
    res.json({ notifications, unread_count: parseInt(row?.c || 0) });
  } catch (e) { res.json({ notifications: [], unread_count: 0 }); }
}));
app.put('/api/notifications/read-all', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  await execute('UPDATE notifications SET is_read = true WHERE user_id = ?', [user.id]);
  res.json({ success: true });
}));
app.put('/api/notifications/:id/read', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  await execute('UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?', [parseInt(req.params.id), user.id]);
  res.json({ success: true });
}));

// --- PENDING TEACHERS ---
app.get('/api/pending-teachers', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  res.json(await queryAll("SELECT pt.*, u.name as added_by_name FROM pending_teachers pt LEFT JOIN users u ON u.id = pt.added_by_user_id ORDER BY CASE COALESCE(pt.status,'pending') WHEN 'guion_revisado' THEN 1 WHEN 'pending' THEN 2 WHEN 'guion_incompleto' THEN 3 WHEN 'contacted' THEN 4 WHEN 'scheduled' THEN 5 WHEN 'unavailable' THEN 6 ELSE 7 END, pt.created_at ASC"));
}));
app.post('/api/pending-teachers', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  let { name, subject_code, subject, subject_type, phone, sede, is_external, notes, drive_link, flight_ticket_path } = req.body;
  if (!subject_code) { const ext = extractCodeAndName(subject); subject_code = ext.code; subject = ext.name; }
  const id = await execute(
    'INSERT INTO pending_teachers (name, subject_code, subject, subject_type, phone, sede, is_external, notes, drive_link, flight_ticket_path, added_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name, subject_code, subject, subject_type || 'Teórica', phone, sede || 'La Paz', !!is_external, notes, drive_link, flight_ticket_path, user.id]
  );
  res.status(201).json(await queryOne('SELECT pt.*, u.name as added_by_name FROM pending_teachers pt LEFT JOIN users u ON u.id = pt.added_by_user_id WHERE pt.id = ?', [id]));
}));
app.put('/api/pending-teachers/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
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
    if ((status === 'scheduled' || status === 'contacted') && user) {
      const pt = await queryOne('SELECT * FROM pending_teachers WHERE id = ?', [id]);
      if (pt?.added_by_user_id && pt.added_by_user_id != user.id) {
        await execute('INSERT INTO notifications (user_id, from_user_id, from_user_name, type, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [pt.added_by_user_id, user.id, user.name, status, `${user.name} actualizó a ${pt.name}`, 'pending_teacher', id]);
      }
    }
  }
  res.json(await queryOne('SELECT pt.*, u.name as added_by_name FROM pending_teachers pt LEFT JOIN users u ON u.id = pt.added_by_user_id WHERE pt.id = ?', [id]));
}));
app.delete('/api/pending-teachers/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  await execute('DELETE FROM pending_teachers WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
}));

// --- GLOBAL SUBJECTS ---
app.get('/api/global-subjects', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const q = req.query.q;
  if (q) return res.json(await queryAll('SELECT * FROM global_subjects WHERE code ILIKE ? OR name ILIKE ? ORDER BY code ASC LIMIT 50', [`%${q}%`, `%${q}%`]));
  res.json(await queryAll('SELECT * FROM global_subjects ORDER BY code ASC'));
}));
app.post('/api/global-subjects', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  try {
    const id = await execute('INSERT INTO global_subjects (code, name, career) VALUES (?, ?, ?)', [req.body.code, req.body.name, req.body.career]);
    res.status(201).json(await queryOne('SELECT * FROM global_subjects WHERE id = ?', [id]));
  } catch (e) { res.status(409).json({ error: 'Esa materia ya existe' }); }
}));
app.delete('/api/global-subjects/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  await execute('DELETE FROM global_subjects WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
}));
app.post('/api/global-subjects/bulk', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAdmin(user, res)) return;
  let inserted = 0, skipped = 0;
  for (const s of req.body.subjects) {
    try { await execute('INSERT INTO global_subjects (code, name, career) VALUES (?, ?, ?) ON CONFLICT (code, name) DO NOTHING', [s.code, s.name, s.career]); inserted++; } 
    catch (e) { skipped++; }
  }
  res.json({ inserted, skipped });
}));

// --- MEETING REQUESTS & PUBLIC ---
app.get('/api/meeting-requests', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const status = req.query.status;
  res.json(await queryAll(status ? 'SELECT * FROM meeting_requests WHERE status = ? ORDER BY created_at DESC' : 'SELECT * FROM meeting_requests ORDER BY created_at DESC', status ? [status] : []));
}));
app.put('/api/meeting-requests/:id', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const id = parseInt(req.params.id);
  const { status, admin_notes } = req.body;
  const mr = await queryOne('SELECT * FROM meeting_requests WHERE id = ?', [id]);
  await execute('UPDATE meeting_requests SET status = ?, admin_notes = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE id = ?', [status, admin_notes || null, user.id, id]);
  if (status === 'approved') {
    await execute('INSERT INTO reservations (user_id, date, start_time, end_time, reason, is_displacement) VALUES (?, ?, ?, ?, ?, false)', [user.id, mr.requested_date, mr.start_time, mr.end_time, `Reunión: ${mr.requester_name}`]);
  }
  res.json({ success: true });
}));

app.get('/api/public/availability', asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year || new Date().getFullYear());
  const month = parseInt(req.query.month || (new Date().getMonth() + 1));
  const pad = n => String(n).padStart(2, '0');
  const stRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_start_time'");
  const etRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_end_time'");
  const daysRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_days'");
  const studioStart = stRow?.value || '08:00';
  const studioEnd = etRow?.value || '18:00';
  const workDays = (daysRow?.value || '1,2,3,4,5').split(',').map(Number);

  const sessions = await queryAll("SELECT session_date::text, start_time::text, end_time::text FROM recording_sessions WHERE EXTRACT(YEAR FROM session_date) = ? AND EXTRACT(MONTH FROM session_date) = ? AND (status IS NULL OR status != 'cancelled')", [year, month]);
  const reservations = await queryAll("SELECT date::text as date, start_time::text, end_time::text FROM reservations WHERE is_displacement = false AND EXTRACT(YEAR FROM date) = ? AND EXTRACT(MONTH FROM date) = ?", [year, month]);
  const closedWeeks = await queryAll('SELECT week_start::text FROM closed_weeks');
  const meetingRequests = await queryAll("SELECT requested_date::text, start_time, end_time FROM meeting_requests WHERE status = 'pending' AND EXTRACT(YEAR FROM requested_date) = ? AND EXTRACT(MONTH FROM requested_date) = ?", [year, month]);

  const availability = [];
  for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const d = new Date(dateStr);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    if (!workDays.includes(dow)) { availability.push({ date: dateStr, status: 'closed' }); continue; }
    
    const mondayOffset = dow === 1 ? 0 : 1 - dow;
    const monday = new Date(d); monday.setDate(d.getDate() + mondayOffset);
    if (closedWeeks.some(cw => cw.week_start === monday.toISOString().split('T')[0])) {
      availability.push({ date: dateStr, status: 'closed', reason: 'Semana cerrada' }); continue;
    }

    const dayMR = meetingRequests.filter(mr => mr.requested_date === dateStr);
    const busyIntervals = [
      ...sessions.filter(s => s.session_date === dateStr).map(s => ({ start: s.start_time?.substring(0, 5), end: s.end_time?.substring(0, 5) })),
      ...reservations.filter(r => r.date === dateStr).map(r => ({ start: r.start_time?.substring(0, 5), end: r.end_time?.substring(0, 5) })),
    ];

    const startH = parseInt(studioStart.split(':')[0]);
    const endH = parseInt(studioEnd.split(':')[0]);
    const allSlots = [];
    for (let h = startH; h < endH; h++) {
      const ss = `${pad(h)}:00`; const se = `${pad(h+1)}:00`;
      if (!busyIntervals.some(b => !(se <= b.start || ss >= b.end))) allSlots.push({ start: ss, end: se });
    }

    if (allSlots.length === 0) availability.push({ date: dateStr, status: 'occupied' });
    else if (allSlots.length === endH - startH) availability.push({ date: dateStr, status: 'available', start_time: studioStart, end_time: studioEnd, pending_meetings: dayMR.length });
    else {
      const merged = [];
      for (const slot of allSlots) {
        if (merged.length && merged[merged.length-1].end === slot.start) merged[merged.length-1].end = slot.end;
        else merged.push({ ...slot });
      }
      availability.push({ date: dateStr, status: 'partial', free_slots: merged, pending_meetings: dayMR.length });
    }
  }
  res.json({ month, year, studio_hours: { start: studioStart, end: studioEnd }, work_days: workDays, availability });
}));
app.post('/api/public/meeting-request', asyncHandler(async (req, res) => {
  const { requester_name, requester_contact, requested_date, start_time, end_time, reason } = req.body;
  const id = await execute('INSERT INTO meeting_requests (requester_name, requester_contact, requested_date, start_time, end_time, reason) VALUES (?, ?, ?, ?, ?, ?)', [requester_name, requester_contact || null, requested_date, start_time, end_time, reason || null]);
  res.status(201).json({ success: true, id });
}));

app.get('/api/availability/:date', asyncHandler(async (req, res) => {
  const user = await getAuthUser(req);
  if (!requireAuth(user, res)) return;
  const date = req.params.date;
  const d = new Date(date + 'T12:00:00');
  const dow = d.getDay();
  const monOff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d); mon.setDate(d.getDate() + monOff);
  const closed = await queryOne('SELECT * FROM closed_weeks WHERE week_start = ?', [mon.toISOString().split('T')[0]]);
  if (closed) return res.json({ closed: true, reason: closed.reason, slots: [] });

  const stRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_start_time'");
  const etRow = await queryOne("SELECT value FROM settings WHERE key = 'studio_end_time'");
  const startH = parseInt((stRow?.value || '08:00').split(':')[0]);
  const endH = parseInt((etRow?.value || '18:00').split(':')[0]);
  const existing = await queryAll("SELECT rs.start_time::text, rs.end_time::text, fa.teacher_name, s.code as subject_code FROM recording_sessions rs JOIN filming_assignments fa ON fa.id = rs.assignment_id JOIN subjects s ON s.id = fa.subject_id WHERE rs.session_date = ? ORDER BY rs.start_time ASC", [date]);

  const slots = [];
  const pad = n => String(n).padStart(2, '0');
  for (let h = startH; h < endH; h++) {
    const ss = `${pad(h)}:00`; const se = `${pad(h+1)}:00`;
    const occ = existing.find(s => {
      const st = s.start_time?.substring(0,5); const et = s.end_time?.substring(0,5);
      return (ss >= st && ss < et) || (se > st && se <= et);
    });
    slots.push({ start: ss, end: se, available: !occ, session: occ || null });
  }
  res.json({ closed: false, slots, existingSessions: existing });
}));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// For Vercel, simply export the Express app
module.exports = app;
