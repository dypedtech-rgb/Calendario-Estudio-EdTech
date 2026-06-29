// ================================================
// Calendar Module — with right-click menu, Ctrl+Z undo, custom confirm
// ================================================

const Calendar = {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    sessions: [],
    closedWeeks: [],
    reservations: [],

    // Undo stack: [{type, data, restoreFn}]
    undoStack: [],

    HOLIDAYS: {
        // Fijos
        '01-01': 'Año Nuevo',
        '01-22': 'Día del Estado Plur.',
        '02-10': 'Efeméride de Oruro',
        '04-15': 'Efeméride de Tarija',
        '05-01': 'Día del Trabajo',
        '05-25': 'Efeméride Chuquisaca',
        '06-21': 'Año Nuevo Andino',
        '07-16': 'Efeméride de La Paz',
        '08-06': 'Independencia',
        '09-14': 'Efeméride Cochabamba',
        '09-24': 'Efeméride Santa Cruz',
        '10-01': 'Efeméride de Pando',
        '11-02': 'Día de los Difuntos',
        '11-10': 'Efeméride de Potosí',
        '11-18': 'Efeméride de Beni',
        '12-25': 'Navidad',
        // Móviles — Carnaval 2025
        '2025-03-03': 'Carnaval',
        '2025-03-04': 'Carnaval',
        // Móviles — Semana Santa 2025
        '2025-04-17': 'Jueves Santo',
        '2025-04-18': 'Viernes Santo',
        // Móviles — Corpus Christi 2025
        '2025-06-19': 'Corpus Christi',
        // Móviles — Carnaval 2026
        '2026-02-16': 'Carnaval',
        '2026-02-17': 'Carnaval',
        // Móviles — Semana Santa 2026
        '2026-04-03': 'Viernes Santo',
        // Feriados extendidos 2026 (DS 5521)
        '2026-01-23': 'Día del Estado Plur. (Traslado)',
        '2026-06-04': 'Corpus Christi',
        '2026-06-05': 'Feriado Largo (Corpus Christi)',
        '2026-06-22': 'Año Nuevo Andino (Traslado)',
        '2026-08-07': 'Feriado Largo (Independencia)',
        // Móviles — Carnaval 2027
        '2027-02-08': 'Carnaval',
        '2027-02-09': 'Carnaval',
        // Móviles — Semana Santa 2027
        '2027-03-25': 'Jueves Santo',
        '2027-03-26': 'Viernes Santo',
        // Móviles — Corpus Christi 2027
        '2027-05-27': 'Corpus Christi',
    },

    MONTH_NAMES: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],

    init() {
        document.getElementById('btn-prev-month').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('btn-next-month').addEventListener('click', () => this.changeMonth(1));
        document.getElementById('btn-today').addEventListener('click', () => {
            this.currentYear = new Date().getFullYear();
            this.currentMonth = new Date().getMonth();
            this.render();
        });

        // Hide context menu on any outside click or scroll
        document.addEventListener('click', () => this.hideCtxMenu());
        document.addEventListener('scroll', () => this.hideCtxMenu(), true);
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            if (e.key === 'Escape') this.hideCtxMenu();
        });

        this.render();
    },

    changeMonth(delta) {
        this.currentMonth += delta;
        if (this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; }
        if (this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; }
        this.render();
    },

    async render() {
        document.getElementById('calendar-month-title').textContent =
            `${this.MONTH_NAMES[this.currentMonth]} ${this.currentYear}`;

        const [sessions, closedWeeks, reservations, meetingRequests] = await Promise.all([
            API.get(`/sessions?month=${this.currentMonth + 1}&year=${this.currentYear}`),
            API.get('/closed-weeks'),
            API.get(`/reservations?month=${this.currentMonth + 1}&year=${this.currentYear}`),
            App.user ? API.get(`/meeting-requests?status=pending`) : Promise.resolve([])
        ]);
        this.sessions = sessions;
        this.closedWeeks = closedWeeks;
        this.reservations = reservations;
        this.meetingRequests = meetingRequests || [];

        // Update notification badge
        this.loadMeetingRequestsBadge(this.meetingRequests.length);

        this.renderGrid();
    },

    loadMeetingRequestsBadge(count) {
        if (count === undefined) {
            // Async fetch
            API.get('/meeting-requests/pending-count').then(r => {
                this._updateBadge(r ? r.count : 0);
            });
        } else {
            this._updateBadge(count);
        }
    },

    _updateBadge(count) {
        const badge = document.getElementById('meeting-requests-badge');
        if (!badge) return;
        if (count > 0 && App.user && (App.user.role === 'admin' || App.user.role === 'post_productor')) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    },

    getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
    },

    isWeekClosed(dateStr) {
        const monday = this.getMonday(dateStr);
        return this.closedWeeks.find(w => w.week_start === monday);
    },

    renderGrid() {
        const grid = document.getElementById('calendar-grid');
        const headers = Array.from(grid.querySelectorAll('.cal-header'));
        grid.innerHTML = '';
        headers.forEach(h => grid.appendChild(h));

        const year = this.currentYear;
        const month = this.currentMonth;
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        let startOffset = firstDay.getDay() - 1;
        if (startOffset < 0) startOffset = 6;

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const prevMonthLast = new Date(year, month, 0).getDate();
        for (let i = startOffset - 1; i >= 0; i--) {
            const dayNum = prevMonthLast - i;
            const m = month === 0 ? 12 : month;
            const y = month === 0 ? year - 1 : year;
            const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            grid.appendChild(this.createDayCell(dayNum, dateStr, true, false, false));
        }

        for (let d = 1; d <= lastDay.getDate(); d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const dayOfWeek = new Date(year, month, d).getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            grid.appendChild(this.createDayCell(d, dateStr, false, isToday, isWeekend));
        }

        const totalCells = grid.querySelectorAll('.cal-day').length;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remaining; i++) {
            const m = month + 2 > 12 ? 1 : month + 2;
            const y = month + 2 > 12 ? year + 1 : year;
            const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            grid.appendChild(this.createDayCell(i, dateStr, true, false, false));
        }
    },

    createDayCell(dayNum, dateStr, isOtherMonth, isToday, isWeekend) {
        const cell = document.createElement('div');
        cell.className = 'cal-day';
        if (isOtherMonth) cell.classList.add('other-month');
        if (isToday) cell.classList.add('today');
        if (isWeekend) cell.classList.add('weekend');

        const closedWeek = this.isWeekClosed(dateStr);
        if (closedWeek) cell.classList.add('closed');

        const dateObj = new Date(dateStr + 'T12:00:00');
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayName = dayNames[dateObj.getDay()];
        cell.innerHTML = `<div class="cal-day-num"><span class="mobile-day-name">${dayName}</span> ${dayNum}</div>`;

        const monthDay = dateStr.substring(5);
        let holidayName = this.HOLIDAYS[dateStr] || this.HOLIDAYS[monthDay];
        
        // Exclude fixed holidays that were moved in 2026
        if (dateStr === '2026-01-22' || dateStr === '2026-06-21') {
            holidayName = null;
        }

        if (holidayName && !isOtherMonth) {
            cell.innerHTML += `<div class="cal-holiday-label" title="${holidayName}" style="font-size: 8.5px; font-weight: 700; color: #ff5e5e; background: rgba(255, 94, 94, 0.1); padding: 2px 4px; border-radius: 3px; margin: 2px 0; text-transform: uppercase; text-align: center; line-height: 1.1; display:flex; gap:3px; align-items:center; justify-content:center;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${holidayName}</span>
            </div>`;
        }

        if (closedWeek) {
            cell.innerHTML += `<div class="cal-closed-label"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: baseline; margin-right: 2px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Cerrado</div>`;
            cell.title = closedWeek.reason || 'Estudio cerrado';
        }

        // Sessions
        const daySessions = this.sessions.filter(s => s.session_date === dateStr);
        daySessions.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

        const renderSession = (session) => {
            const ev = document.createElement('div');
            const isCancelled = session.status === 'cancelled';
            ev.className = `cal-event status-${session.assignment_status || 'in_progress'}${isCancelled ? ' session-cancelled' : ''}`;
            const typeColors = {
                'Teórica':   { bg: 'rgba(96,165,250,0.2)', color: '#60a5fa' },
                'Numérica':  { bg: 'rgba(52,211,153,0.2)', color: '#34d399' },
                'Proyecto Integrador': { bg: 'rgba(167,139,250,0.2)', color: '#a78bfa' }
            };
            const tc = typeColors[session.subject_type] || typeColors['Teórica'];
            const typeTag = session.subject_type
                ? `<span style="display:inline-block;background:${tc.bg};color:${tc.color};font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;margin-top:2px;">${session.subject_type}</span>`
                : '';

            const t1 = session.start_time?.substring(0, 5) || '';
            const t2 = session.end_time?.substring(0, 5) || '';
            let isFullDay = false;
            if (t1 && t2) {
                const sMins = parseInt(t1.split(':')[0]) * 60 + parseInt(t1.split(':')[1]);
                const eMins = parseInt(t2.split(':')[0]) * 60 + parseInt(t2.split(':')[1]);
                // Si abarca estrictamente la mañana y la tarde (ej. comienza <= 13:00 y termina >= 14:30)
                if (sMins <= 13 * 60 && eMins >= 14 * 60 + 30) {
                    isFullDay = true;
                }
            }
            if (isFullDay) ev.classList.add('is-fullday');
            const fullDayBadge = isFullDay ? `<span title="Día y Tarde" style="background:var(--amber-bg);color:var(--amber);padding:1px 4px;border-radius:3px;font-size:8px;font-weight:800;margin-left:4px;vertical-align:middle;display:inline-flex;align-items:center;gap:2px;border:1px solid rgba(251,191,36,0.3);"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>FULL DAY</span>` : '';
            const cancelledBadge = isCancelled ? `<span style="background:rgba(239,68,68,0.15);color:#ef4444;padding:1px 4px;border-radius:3px;font-size:8px;font-weight:800;margin-left:4px;vertical-align:middle;display:inline-flex;align-items:center;gap:2px;border:1px solid rgba(239,68,68,0.3);"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>CANCELADO</span>` : '';


            const isExternal = session.sede && !['la paz', 'el alto'].includes(session.sede.trim().toLowerCase());
            const externalBadge = isExternal
                ? `<span class="ext-tag" style="background:var(--red-bg);color:var(--red);padding:1px 4px;border-radius:3px;font-size:8px;font-weight:800;margin-right:4px;vertical-align:middle;display:inline-flex;align-items:center;border:1px solid rgba(239,68,68,0.3);">${session.sede.toUpperCase()}</span>`
                : '';

            ev.innerHTML = `
                <div class="cal-event-header">
                    <span class="cal-event-time">${t1} - ${t2} ${fullDayBadge}${cancelledBadge}</span>
                    <span class="cal-event-code">${session.subject_code}</span>
                </div>
                <div class="cal-event-subject" style="${isCancelled ? 'text-decoration:line-through;opacity:0.6;' : ''}">${session.subject_name} ${typeTag}</div>
                <div class="cal-event-teacher">${externalBadge}${session.teacher_name}</div>
            `;
            ev.title = `${isCancelled ? 'CANCELADO — ' : ''}${session.teacher_name}${isExternal ? ` (${session.sede})` : ''} — ${session.subject_name}\n${session.start_time} - ${session.end_time}`;

            if (App.user) {
                ev.style.cursor = 'pointer';
                ev.addEventListener('click', (e) => {
                    e.stopPropagation();
                    Modals.showAssignmentDetail(session.assignment_id);
                });
            }

            if (App.user && ['admin', 'post_productor'].includes(App.user.role)) {
                ev.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showCtxMenu(e.clientX, e.clientY, [
                        {
                            label: 'Ver detalle',
                            icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
                            action: () => Modals.showAssignmentDetail(session.assignment_id)
                        },
                        { separator: true },
                        {
                            label: `Eliminar sesión`,
                            icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
                            danger: true,
                            action: () => this.confirmDeleteSession(session)
                        }
                    ]);
                });
            }
            return ev;
        };

        // Reservations (filter out identical duplicates)
        const allDayReservations = this.reservations?.filter(r => r.date === dateStr) || [];
        const seen = new Set();
        const dayReservations = allDayReservations.filter(r => {
            const key = `${r.start_time}-${r.end_time}-${r.reason}-${r.user_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const renderReservation = (r) => {
            const ev = document.createElement('div');
            
            const currentD = new Date(r.date + 'T00:00:00');
            const prevD = new Date(currentD); prevD.setDate(prevD.getDate() - 1);
            const nextD = new Date(currentD); nextD.setDate(nextD.getDate() + 1);
            
            const prevStr = prevD.toISOString().split('T')[0];
            const nextStr = nextD.toISOString().split('T')[0];
            
            const hasPrev = this.reservations.some(r2 => r2.date === prevStr && r2.user_id === r.user_id && r2.reason === r.reason && r2.start_time === r.start_time);
            const hasNext = this.reservations.some(r2 => r2.date === nextStr && r2.user_id === r.user_id && r2.reason === r.reason && r2.start_time === r.start_time);
            
            let spanClass = '';
            if (hasPrev && hasNext) spanClass = 'span-middle';
            else if (!hasPrev && hasNext) spanClass = 'span-start';
            else if (hasPrev && !hasNext) spanClass = 'span-end';

            const isDisplacement = r.is_displacement == 1 || r.is_displacement === true;
            const dispClass = isDisplacement ? 'displacement' : '';
            ev.className = `cal-event reservation ${spanClass} ${dispClass}`.trim();
            const hideText = spanClass === 'span-middle' || spanClass === 'span-end' ? 'opacity: 0;' : '';
            const svgBox = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px;vertical-align:middle"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>';
            const badge = isDisplacement ? `${svgBox}DESPLAZ.` : 'RESERVA';
            ev.innerHTML = `
                <div class="cal-event-header" style="${hideText}">
                    <span class="cal-event-time">${r.start_time?.substring(0, 5)} - ${r.end_time?.substring(0, 5)}</span>
                    <span class="cal-event-code">${badge}</span>
                </div>
                <div class="cal-event-subject" style="${hideText}">${r.reason || 'Bloqueado'}</div>
                <div class="cal-event-teacher" style="${hideText}">Por: ${r.user_name}</div>
            `;
            ev.title = `${isDisplacement ? 'DESPLAZAMIENTO\nEl estudio queda libre' : 'RESERVA'}\nMotivo: ${r.reason}\n${r.start_time} - ${r.end_time}`;

            const canDelete = App.user && (App.user.role === 'admin' || App.user.role === 'post_productor' || App.user.id === r.user_id);

            if (canDelete) {
                ev.style.cursor = 'pointer';
                ev.addEventListener('click', (e) => {
                    e.stopPropagation();
                    Modals.openEditReservation(r);
                });
                ev.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showCtxMenu(e.clientX, e.clientY, [
                        {
                            label: `Reserva: ${r.user_name}`,
                            header: true
                        },
                        {
                            label: 'Editar reserva',
                            icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
                            action: () => Modals.openEditReservation(r)
                        },
                        {
                            label: 'Eliminar reserva',
                            icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
                            danger: true,
                            action: () => this.confirmDeleteReservation(r)
                        }
                    ]);
                });
            }

            return ev;
        };

        // Render meeting request events (pulsing, admin only)
        const renderMeetingRequest = (mr) => {
            const ev = document.createElement('div');
            ev.className = 'cal-event meeting-request-pending';
            ev.innerHTML = `
                <div class="cal-event-header">
                    <span class="cal-event-time">${mr.start_time?.substring(0,5)} - ${mr.end_time?.substring(0,5)}</span>
                    <span class="cal-event-code"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px;vertical-align:middle"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg> REUNIÓN</span>
                </div>
                <div class="cal-event-subject">${mr.requester_name}</div>
            `;
            ev.title = `Solicitud de reunión pendiente\n${mr.requester_name}\n${mr.start_time} - ${mr.end_time}`;
            if (App.user && (App.user.role === 'admin' || App.user.role === 'post_productor')) {
                ev.addEventListener('click', (e) => {
                    e.stopPropagation();
                    Modals.openMeetingRequestDetail(mr);
                });
            }
            return ev;
        };

        const activeDaySessions = daySessions.filter(s => s.status !== 'cancelled');
        const morningSessions = daySessions.filter(s => s.start_time < '13:00:00');
        const afternoonSessions = daySessions.filter(s => s.start_time >= '13:00:00');
        // Only non-displacement reservations block the studio
        const blockingReservations = dayReservations.filter(r => !r.is_displacement || r.is_displacement == 0);
        const displacementReservations = dayReservations.filter(r => r.is_displacement == 1 || r.is_displacement === true);
        const morningReservations = blockingReservations.filter(r => r.start_time < '13:00:00');
        const afternoonReservations = blockingReservations.filter(r => r.start_time >= '13:00:00');
        const morningDisplacements = displacementReservations.filter(r => r.start_time < '13:00:00');
        const afternoonDisplacements = displacementReservations.filter(r => r.start_time >= '13:00:00');

        // Meeting requests for this day (pending)
        const dayMeetingRequests = (this.meetingRequests || []).filter(mr => mr.requested_date === dateStr);

        const hasFullDaySession = activeDaySessions.some(s => {
            const t1 = s.start_time?.substring(0, 5) || '';
            const t2 = s.end_time?.substring(0, 5) || '';
            if (t1 && t2) {
                const sMins = parseInt(t1.split(':')[0]) * 60 + parseInt(t1.split(':')[1]);
                const eMins = parseInt(t2.split(':')[0]) * 60 + parseInt(t2.split(':')[1]);
                return sMins <= 13 * 60 && eMins >= 14 * 60 + 30;
            }
            return false;
        });

        const activeMorningSessions = activeDaySessions.filter(s => s.start_time < '13:00:00');
        const activeAfternoonSessions = activeDaySessions.filter(s => s.start_time >= '13:00:00');
        const isMorningReserved = activeMorningSessions.length > 0 || morningReservations.length > 0;
        const isAfternoonReserved = activeAfternoonSessions.length > 0 || afternoonReservations.length > 0;

        if (!isOtherMonth && !closedWeek) {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const isPast = dateStr < todayStr;
            const showAvailable = !isPast && !isWeekend && !holidayName;

            // Render Morning Label
            if (isMorningReserved) {
                const morningLbl = document.createElement('div');
                morningLbl.className = 'cal-shift-label';
                morningLbl.style.color = '#fbbf24';
                let labelText = hasFullDaySession ? 'DIA RESERVADO' : 'MAÑANA RESERVADA';
                morningLbl.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 3px; color: #fbbf24;"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>${labelText}`;
                cell.appendChild(morningLbl);
            } else if (showAvailable) {
                const morningLbl = document.createElement('div');
                morningLbl.className = 'cal-shift-label';
                morningLbl.style.color = 'var(--green)';
                morningLbl.style.opacity = '0.7';
                morningLbl.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 3px; color: var(--green);"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>MAÑANA DISPONIBLE`;
                cell.appendChild(morningLbl);
            }
            morningSessions.forEach(s => cell.appendChild(renderSession(s)));
            morningReservations.forEach(r => cell.appendChild(renderReservation(r)));
            morningDisplacements.forEach(r => cell.appendChild(renderReservation(r)));
            dayMeetingRequests.filter(mr => mr.start_time < '13:00:00').forEach(mr => cell.appendChild(renderMeetingRequest(mr)));

            // Render Afternoon Label
            if (isAfternoonReserved && !hasFullDaySession) {
                const afternoonLbl = document.createElement('div');
                afternoonLbl.className = 'cal-shift-label';
                afternoonLbl.style.color = '#f97316';
                afternoonLbl.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 3px; color: #f97316;"><path d="M17 18a5 5 0 0 0-10 0"></path><line x1="12" y1="2" x2="12" y2="9"></line><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"></line><line x1="1" y1="18" x2="3" y2="18"></line><line x1="21" y1="18" x2="23" y2="18"></line><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"></line><line x1="23" y1="22" x2="1" y2="22"></line><polyline points="8 6 12 2 16 6"></polyline></svg>TARDE RESERVADA`;
                cell.appendChild(afternoonLbl);
            } else if (showAvailable && !hasFullDaySession) {
                const afternoonLbl = document.createElement('div');
                afternoonLbl.className = 'cal-shift-label';
                afternoonLbl.style.color = 'var(--green)';
                afternoonLbl.style.opacity = '0.7';
                afternoonLbl.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 3px; color: var(--green);"><path d="M17 18a5 5 0 0 0-10 0"></path><line x1="12" y1="2" x2="12" y2="9"></line><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"></line><line x1="1" y1="18" x2="3" y2="18"></line><line x1="21" y1="18" x2="23" y2="18"></line><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"></line><line x1="23" y1="22" x2="1" y2="22"></line><polyline points="8 6 12 2 16 6"></polyline></svg>TARDE DISPONIBLE`;
                cell.appendChild(afternoonLbl);
            }
            afternoonSessions.forEach(s => cell.appendChild(renderSession(s)));
            afternoonReservations.forEach(r => cell.appendChild(renderReservation(r)));
            afternoonDisplacements.forEach(r => cell.appendChild(renderReservation(r)));
            dayMeetingRequests.filter(mr => mr.start_time >= '13:00:00').forEach(mr => cell.appendChild(renderMeetingRequest(mr)));
        } else {
            // Render without labels for otherMonth or closedWeeks, just to be safe in case there's unexpected data
            morningSessions.forEach(s => cell.appendChild(renderSession(s)));
            morningReservations.forEach(r => cell.appendChild(renderReservation(r)));
            afternoonSessions.forEach(s => cell.appendChild(renderSession(s)));
            afternoonReservations.forEach(r => cell.appendChild(renderReservation(r)));
        }

        // Right-click on closed cell to open/delete the week close
        if (closedWeek && App.user && ['admin', 'post_productor'].includes(App.user.role)) {
            cell.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showCtxMenu(e.clientX, e.clientY, [
                    { label: closedWeek.reason || 'Semana cerrada', header: true },
                    {
                        label: 'Reabrir semana',
                        icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/><line x1="12" y1="15" x2="12" y2="19"/></svg>',
                        action: async () => {
                            await API.del(`/closed-weeks/${closedWeek.id}`);
                            this.undoStack.push({
                                label: `Semana reabierta (${closedWeek.week_start})`,
                                undo: async () => {
                                    await API.post('/closed-weeks', { week_start: closedWeek.week_start, reason: closedWeek.reason });
                                    this.render();
                                }
                            });
                            showToast('Semana reabierta', 'success', true);
                            this.render();
                        }
                    }
                ]);
            });
        }



        if (!closedWeek && !isOtherMonth && App.user && App.user.role !== 'academica') {
            cell.addEventListener('click', () => {
                const sd = document.getElementById('input-session-date');
                const nsd = document.getElementById('input-new-session-date');
                if (sd) sd.value = dateStr;
                if (nsd) nsd.value = dateStr;
            });
        }

        return cell;
    },

    // ---- Context Menu ----
    showCtxMenu(x, y, items) {
        const menu = document.getElementById('ctx-menu');
        const container = document.getElementById('ctx-menu-items');
        container.innerHTML = '';

        items.forEach(item => {
            if (item.separator) {
                const sep = document.createElement('div');
                sep.className = 'ctx-separator';
                container.appendChild(sep);
                return;
            }
            if (item.header) {
                const hdr = document.createElement('div');
                hdr.className = 'ctx-header';
                hdr.textContent = item.label;
                container.appendChild(hdr);
                return;
            }
            const el = document.createElement('div');
            el.className = `ctx-item${item.danger ? ' ctx-danger' : ''}${item.disabled ? ' ctx-disabled' : ''}`;
            el.innerHTML = `${item.icon || ''}${item.label}`;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideCtxMenu();
                item.action?.();
            });
            container.appendChild(el);
        });

        menu.style.display = 'block';

        // Position — keep inside viewport
        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = x, top = y;
        if (x + 200 > vw) left = x - 200;
        if (y + container.children.length * 38 > vh) top = y - (container.children.length * 38);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    },

    hideCtxMenu() {
        document.getElementById('ctx-menu').style.display = 'none';
    },

    // ---- Custom Confirm Dialog ----
    showConfirm({ title, message, okLabel = 'Eliminar' } = {}, onOk) {
        const overlay = document.getElementById('confirm-overlay');
        document.getElementById('confirm-title').textContent = title || '¿Confirmar acción?';
        document.getElementById('confirm-message').textContent = message || '';
        document.getElementById('confirm-ok').textContent = okLabel;
        document.getElementById('confirm-icon').innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
        overlay.style.display = 'flex';

        const cancel = document.getElementById('confirm-cancel');
        const ok = document.getElementById('confirm-ok');

        const cleanup = () => {
            overlay.style.display = 'none';
            ok.replaceWith(ok.cloneNode(true));
            cancel.replaceWith(cancel.cloneNode(true));
        };

        document.getElementById('confirm-ok').addEventListener('click', () => {
            cleanup();
            onOk?.();
        });
        document.getElementById('confirm-cancel').addEventListener('click', cleanup);

        // ESC to close
        const escHandler = (e) => {
            if (e.key === 'Escape') { cleanup(); document.removeEventListener('keydown', escHandler); }
        };
        document.addEventListener('keydown', escHandler);
    },

    // ---- Delete helpers ----
    async confirmDeleteSession(session) {
        this.showConfirm({
            title: 'Eliminar sesión',
            message: `¿Eliminar la sesión de ${session.teacher_name} (${session.subject_code}) del ${session.session_date}?`
        }, async () => {
            // Save for undo
            const backup = { ...session };
            await API.del(`/sessions/${session.id}`);
            this.undoStack.push({
                label: `Sesión de ${session.subject_code}`,
                undo: async () => {
                    await API.post('/sessions', {
                        assignment_id: backup.assignment_id,
                        session_date: backup.session_date,
                        start_time: backup.start_time,
                        end_time: backup.end_time,
                        hito_reached: backup.hito_reached,
                        notes: backup.notes
                    });
                    this.render();
                }
            });
            showToastWithUndo(`Sesión eliminada`);
            this.render();
        });
    },

    async confirmDeleteReservation(r) {
        this.showConfirm({
            title: 'Eliminar reserva',
            message: `¿Eliminar la reserva de ${r.user_name} del ${r.date} (${r.start_time} - ${r.end_time})?`
        }, async () => {
            const backup = { ...r };
            await API.del(`/reservations/${r.id}`);
            this.undoStack.push({
                label: `Reserva de ${r.user_name}`,
                undo: async () => {
                    await API.post('/reservations', {
                        start_date: backup.date, end_date: backup.date,
                        start_time: backup.start_time, end_time: backup.end_time,
                        reason: backup.reason
                    });
                    this.render();
                }
            });
            showToastWithUndo(`Reserva eliminada`);
            this.render();
        });
    },

    // ---- Ctrl+Z Undo ----
    async undo() {
        if (this.undoStack.length === 0) {
            showToast('Nada para deshacer', 'info');
            return;
        }
        const last = this.undoStack.pop();
        showToast(`Deshaciendo: ${last.label}...`, 'info');
        await last.undo();
    },

    // ---- Attendees field ----
    addAttendeeField(value = '') {
        const list = document.getElementById('attendees-list');
        if (!list) return;
        const max = 4;
        if (list.children.length >= max) {
            showToast(`Máximo ${max} personas adicionales`, 'info');
            return;
        }
        const staff = Array.isArray(this._staffUsers) ? this._staffUsers : [];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;';

        const select = document.createElement('select');
        select.className = 'input select attendee-input';
        select.style.cssText = 'flex:1;font-size:12px;';
        select.innerHTML = '<option value="">-- Seleccionar persona --</option>';
        staff.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.name || u.username;
            opt.textContent = u.name || u.username;
            if ((u.name || u.username) === value) opt.selected = true;
            select.appendChild(opt);
        });
        if (value && !staff.find(u => (u.name || u.username) === value)) {
            // Value not in staff list, add it as a custom option
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            opt.selected = true;
            select.appendChild(opt);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.title = 'Quitar';
        removeBtn.style.cssText = 'width:28px;height:28px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--red);cursor:pointer;font-size:16px;line-height:1;';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => row.remove();

        row.appendChild(select);
        row.appendChild(removeBtn);
        list.appendChild(row);
    }
};

// Extended showToast with undo button
function showToastWithUndo(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-success`;
    toast.innerHTML = `${message} <button class="toast-undo-btn" onclick="Calendar.undo()">↩ Deshacer</button>`;
    container.appendChild(toast);
    let timer = setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 5000);
    toast.querySelector('.toast-undo-btn').addEventListener('click', () => {
        clearTimeout(timer);
        toast.remove();
    });
}
