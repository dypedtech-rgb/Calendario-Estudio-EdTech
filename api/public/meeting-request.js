const { execute } = require('../_lib/db');
const { cors } = require('../_lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { requester_name, requester_contact, requested_date, start_time, end_time, reason } = req.body;
  if (!requester_name || !requested_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Campos requeridos: nombre, fecha y horario' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ error: 'La hora de fin debe ser mayor a la hora de inicio' });
  }

  const id = await execute(
    'INSERT INTO meeting_requests (requester_name, requester_contact, requested_date, start_time, end_time, reason) VALUES (?, ?, ?, ?, ?, ?)',
    [requester_name, requester_contact || null, requested_date, start_time, end_time, reason || null]
  );
  res.status(201).json({ success: true, id, message: 'Solicitud enviada. El administrador la revisará pronto.' });
};
