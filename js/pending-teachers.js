// ================================================
// Pending Teachers Module — Agenda de Docentes
// ================================================

const TEACHER_STATUS = {
    pending:          { label: 'Pendiente',         color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
    contacted:        { label: 'Contactado',         color: '#22d3ee', bg: 'rgba(34,211,238,0.15)' },
    scheduled:        { label: 'Agendado',           color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
    unavailable:      { label: 'No Disponible',      color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
    guion_revisado:   { label: 'Guión Terminado',     color: '#a78bfa', bg: 'rgba(167,139,250,0.2)'  },
    guion_incompleto: { label: 'Guión Incompleto',   color: '#fb923c', bg: 'rgba(251,146,60,0.2)'   }
};

const SCRIPT_STATUS_LABELS = {
    not_uploaded:       'Sin Guión',
    guion_pendiente:    'GUIÓN PENDIENTE',
    guion_revisado:     'GUIÓN REVISADO',
    uploaded_hito_v:    'Cargado (Hito V)',
    pending_review:     'Pendiente de Revisión',
    in_review:          'En Revisión',
    needs_corrections:  'Requiere Correcciones',
    approved:           'Revisado'
};

const SCRIPT_STATUS_COLORS = {
    not_uploaded:       { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af' },
    guion_pendiente:    { bg: 'rgba(251,191,36,0.2)',   color: '#fbbf24' },
    guion_revisado:     { bg: 'rgba(52,211,153,0.2)',   color: '#34d399' },
    uploaded_hito_v:    { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
    pending_review:     { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
    in_review:          { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
    needs_corrections:  { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
    approved:           { bg: 'rgba(52,211,153,0.15)',  color: '#34d399' }
};

const PendingTeachers = {
    teachers: [],
    subjects: [],
    activeFilter: 'all',
    searchQuery: '',
    editingId: null,

    checkFlightTicketVisibility() {
        const sede = document.getElementById('input-pt-sede').value;
        const container = document.getElementById('pt-flight-ticket-container');
        if (container) {
            if (sede && sede !== 'La Paz' && sede !== 'El Alto') {
                container.style.display = '';
            } else {
                container.style.display = 'none';
            }
        }
    },

    init() {
        // Quick add
        document.getElementById('btn-quick-add').addEventListener('click', () => this.quickAdd());
        document.getElementById('qa-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.quickAdd(); });
        document.getElementById('qa-phone').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.quickAdd(); });

        // Autofill type when subject selected in quick-add
        document.getElementById('qa-subject').addEventListener('change', (e) => {
            this.autofillType('qa-subject', 'qa-subject-type');
        });
        // Autofill type when subject selected in modal
        document.getElementById('input-pt-subject').addEventListener('change', (e) => {
            this.autofillType('input-pt-subject', 'input-pt-subject-type');
        });

        // Modal add
        document.getElementById('btn-add-pending-teacher').addEventListener('click', () => this.openModal());
        document.getElementById('btn-save-pending-teacher').addEventListener('click', () => this.saveFromModal());

        // Close modal delegates
        document.querySelectorAll('#modal-pending-teacher [data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => Modals.closeAll());
        });

        // Filter tabs
        document.querySelectorAll('#pt-filter-tabs .admin-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setFilter(btn.dataset.filter));
        });

        // F2.5: Search input
        document.getElementById('pt-search')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.trim();
            this.render();
        });
    },

    setFilter(filter) {
        this.activeFilter = filter;
        // Update tab UI
        document.querySelectorAll('#pt-filter-tabs .admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`#pt-filter-tabs [data-filter="${filter}"]`)?.classList.add('active');
        this.render();
    },

    async loadSubjects() {
        if (!App.activeSemester) return;
        const res = await API.get(`/subjects?semester_id=${App.activeSemester.id}`);
        if (res && res.error) {
            console.error('API Error:', res.error);
            this.subjects = [];
        } else {
            this.subjects = res || [];
        }
        this.populateSubjectSelects();
    },

    populateSubjectSelects() {
        if (!Array.isArray(this.subjects)) return;
        const subjects = this.subjects.filter(s => !s.completed);
        const makeOptions = () => {
            let html = '<option value="">-- Seleccionar Materia --</option>';
            for (const s of subjects) {
                const label = `${s.code} — ${s.name}`;
                html += `<option value="${s.name}" data-code="${s.code}" data-type="${s.subject_type || 'Teórica'}">${label}</option>`;
            }
            return html;
        };
        document.getElementById('qa-subject').innerHTML = makeOptions();
        document.getElementById('input-pt-subject').innerHTML = makeOptions();
    },

    autofillType(subjectSelectId, typeInputId) {
        const sel = document.getElementById(subjectSelectId);
        const opt = sel.options[sel.selectedIndex];
        const type = opt?.dataset?.type || 'Teórica';

        // Update hidden input
        const hidden = document.getElementById(typeInputId);
        if (hidden) hidden.value = type;

        // Update visual tag
        const tagColors = {
            'Teórica':   { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
            'Numérica':  { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
            'Proyecto Integrador': { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
        };
        const tc = tagColors[type] || tagColors['Teórica'];

        // Tag for quick-add bar
        if (typeInputId === 'qa-subject-type') {
            const tag = document.getElementById('qa-subject-type-tag');
            if (tag) { tag.textContent = type; tag.style.background = tc.bg; tag.style.color = tc.color; }
        }
        // Tag for modal
        if (typeInputId === 'input-pt-subject-type') {
            const tag = document.getElementById('modal-subject-type-tag');
            if (tag) { tag.textContent = type; tag.style.background = tc.bg; tag.style.color = tc.color; }
        }
    },

    async refresh() {
        // Always load ALL teachers (no more resolved filter)
        const res = await API.get('/pending-teachers?resolved=1');
        if (res && res.error) {
            console.error('API Error:', res.error);
            this.teachers = [];
        } else {
            this.teachers = res;
        }

        // Reload subjects if we don't have them yet
        if (!this.subjects || this.subjects.length === 0) await this.loadSubjects();
        this.render();
    },

    render() {
        const list = document.getElementById('pending-list');
        const allTeachers = this.teachers;

        // Compute stats from ALL teachers
        const total = allTeachers.length;
        const pending = allTeachers.filter(t => !t.status || t.status === 'pending').length;
        const contacted = allTeachers.filter(t => t.status === 'contacted').length;
        const scheduled = allTeachers.filter(t => t.status === 'scheduled').length;
        const unavailable = allTeachers.filter(t => t.status === 'unavailable').length;

        document.getElementById('pt-total').textContent = total;
        document.getElementById('pt-pending').textContent = pending;
        document.getElementById('pt-contacted').textContent = contacted;
        document.getElementById('pt-scheduled').textContent = scheduled;
        document.getElementById('pt-unavailable').textContent = unavailable;

        // Apply active filter
        let teachers = allTeachers;
        if (this.activeFilter !== 'all') {
            if (this.activeFilter === 'pending') {
                teachers = allTeachers.filter(t => !t.status || t.status === 'pending');
            } else {
                teachers = allTeachers.filter(t => t.status === this.activeFilter);
            }
        }

        // F2.5: Apply text search
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            teachers = teachers.filter(t => 
                t.name.toLowerCase().includes(q) || 
                (t.subject && t.subject.toLowerCase().includes(q)) ||
                (t.subject_code && t.subject_code.toLowerCase().includes(q))
            );
        }

        if (teachers.length === 0) {
            const filterLabel = this.activeFilter === 'all' ? '' : ` con estado "${TEACHER_STATUS[this.activeFilter]?.label || this.activeFilter}"`;
            list.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <p>No hay docentes${filterLabel}</p>
                    <span>${this.activeFilter === 'all' ? 'Agrega docentes usando el formulario rápido o el botón superior' : 'Cambia el filtro para ver otros docentes'}</span>
                </div>`;
            return;
        }

        let html = '';
        
        // Grouping logic
        const groups = {};
        for (const t of teachers) {
            const st = t.status || 'pending';
            if (!groups[st]) groups[st] = [];
            groups[st].push(t);
        }

        // Define order for status groups
        const statusOrder = ['pending', 'contacted', 'scheduled', 'guion_revisado', 'guion_incompleto', 'unavailable'];

        for (const st of statusOrder) {
            if (!groups[st] || groups[st].length === 0) continue;
            
            const statusInfo = TEACHER_STATUS[st] || TEACHER_STATUS.pending;
            
            // Add group header
            html += `<div class="pending-group-header">
                ${statusInfo.label} <span>${groups[st].length}</span>
            </div>`;

            for (const t of groups[st]) {
                const isExt = t.is_external;
                const status = t.status || 'pending';

                const cardClass = `pt-card${isExt ? ' pt-external' : ''}${status === 'unavailable' ? ' pt-unavailable-card' : ''}`;

                const sedeIcon = isExt
                    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
                    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

                const phoneDisplay = t.phone
                    ? (() => {
                        const cleanPhone = t.phone.replace(/[^0-9]/g, '');
                        const greeting = encodeURIComponent('Hola ' + t.name + ', le escribimos del Estudio de Filmaci\u00f3n EDTECH respecto a la materia ' + (t.subject_code || '') + ' ' + t.subject + '. \u00bfPodr\u00edamos coordinar su grabaci\u00f3n?');
                        return `<a href="https://wa.me/${cleanPhone}?text=${greeting}" target="_blank" class="pt-phone-link" title="Abrir en WhatsApp">${t.phone}</a>`;
                    })()
                    : '<span class="pt-no-phone">Sin número</span>';

                const _createdDate = new Date(t.created_at);
                const _now = new Date();
                const _diffMs = _now - _createdDate;
                const _diffDays = Math.floor(_diffMs / (1000 * 60 * 60 * 24));
                const _dateFormatted = _createdDate.toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
                const dateCreated = _diffDays === 0
                    ? `${_dateFormatted} · <span class="pt-days-badge pt-days-today">Hoy</span>`
                    : _diffDays === 1
                        ? `${_dateFormatted} · <span class="pt-days-badge pt-days-1">Pasó 1 día</span>`
                        : _diffDays <= 3
                            ? `${_dateFormatted} · <span class="pt-days-badge pt-days-low">Pasaron ${_diffDays} días</span>`
                            : _diffDays <= 6
                                ? `${_dateFormatted} · <span class="pt-days-badge pt-days-mid">Pasaron ${_diffDays} días</span>`
                                : `${_dateFormatted} · <span class="pt-days-badge pt-days-high">Pasaron ${_diffDays} días</span>`;

                const typeColors = {
                    'Teórica':   { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
                    'Numérica':  { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
                    'Proyecto Integrador': { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
                };
                const tc = typeColors[t.subject_type] || typeColors['Teórica'];

                // Action buttons based on role
                const canEdit = App.user && (App.user.role !== 'academica' || t.added_by_user_id === App.user.id);
                const canManage = App.user && ['admin', 'post_productor'].includes(App.user.role);
                const canViewComments = !!App.user;

                let actionsHtml = '';
                if (canEdit || canManage || canViewComments) {
                    actionsHtml = `<div class="pt-actions">`;

                    if (canManage) {
                        actionsHtml += `<select class="input select pt-status-select" data-id="${t.id}" style="font-size:11px;padding:3px 8px;height:28px;" title="Cambiar estado">
                            <option value="pending"          ${status === 'pending'          ? 'selected' : ''}>Pendiente</option>
                            <option value="contacted"         ${status === 'contacted'         ? 'selected' : ''}>Contactado</option>
                            <option value="scheduled"         ${status === 'scheduled'         ? 'selected' : ''}>Agendado</option>
                            <option value="unavailable"       ${status === 'unavailable'       ? 'selected' : ''}>No Disponible</option>
                            <option value="guion_revisado"    ${status === 'guion_revisado'    ? 'selected' : ''}>Guión Terminado</option>
                            <option value="guion_incompleto"  ${status === 'guion_incompleto'  ? 'selected' : ''}>Guión Incompleto</option>
                        </select>`;
                    }

                    if (canManage && (status === 'pending' || status === 'contacted')) {
                        actionsHtml += `<button class="btn-sm btn-success" onclick="PendingTeachers.scheduleFromAgenda(${t.id})" title="Crear filmación" style="gap:4px;font-size:11px;padding:3px 10px;height:28px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Agendar
                        </button>`;
                    }

                    if (canViewComments) {
                        actionsHtml += `<button class="btn-sm btn-outline pt-comment-btn" data-id="${t.id}" title="Ver notas y comentarios" style="gap:4px;font-size:11px;padding:3px 10px;height:28px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            Notas
                        </button>`;
                    }

                    if (canEdit) {
                        actionsHtml += `<button class="btn-icon" onclick="PendingTeachers.editTeacher(${t.id})" title="Editar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>`;
                    }

                    if (canManage) {
                        actionsHtml += `<button class="btn-icon" onclick="PendingTeachers.deleteTeacher(${t.id})" title="Eliminar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>`;
                    }

                    actionsHtml += `</div>`;
                }

                const alarmIndicator = status === 'guion_incompleto' 
                    ? `<span class="pt-alarm-indicator" title="Falta información para agendar"><span class="pt-alarm-dot"></span></span>`
                    : '';

                html += `<div class="${cardClass}" data-id="${t.id}">
                    <div class="pt-card-main">
                        <div class="pt-card-top">
                            <div class="pt-avatar">${t.name.charAt(0).toUpperCase()}</div>
                            <div class="pt-info">
                                <div class="pt-name">${t.name} ${alarmIndicator}</div>
                                <div class="pt-subject">
                                    ${t.subject_code ? `<span class="pt-subject-code">${t.subject_code}</span> ` : ''}${t.subject}
                                    ${t.subject_type ? `<span class="ext-tag" style="background:${tc.bg};color:${tc.color};font-weight:600;">${t.subject_type}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="pt-meta" style="flex-direction:row; align-items:center; width:100%; justify-content:space-between; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div class="pt-sede-badge ${isExt ? 'sede-external' : ''}">
                                    ${sedeIcon}
                                    <span>${t.sede}</span>
                                    ${isExt ? '<span class="ext-tag">EXTERNO</span>' : ''}
                                </div>
                                <div class="pt-phone">${phoneDisplay}</div>
                            </div>
                        </div>
                        ${actionsHtml}
                    </div>
                ${t.notes ? `<div class="pt-notes">${t.notes}</div>` : ''}
                <div class="pt-date">
                    ${t.added_by_name ? `<span class="pt-added-by">Añadido por <strong>${t.added_by_name}</strong> · </span>` : ''}${dateCreated}
                </div>
                ${(t.drive_link || t.flight_ticket_path) ? `
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
                    ${t.drive_link ? `
                    <div class="pt-drive-link" style="margin-top:0;">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        <a href="${t.drive_link}" target="_blank" rel="noopener" class="pt-drive-anchor" title="Abrir carpeta de guiones">Ver Guiones en Drive</a>
                    </div>` : ''}
                    ${t.flight_ticket_path ? `
                    <div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:6px 10px;border-radius:6px;background:var(--purple-bg);border:1px solid rgba(188,140,255,0.2);color:var(--purple);text-decoration:none;">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <a href="/api${t.flight_ticket_path}" target="_blank" rel="noopener" style="color:var(--purple);text-decoration:none;" title="Abrir pasaje de vuelo">Ver Pasaje</a>
                    </div>` : ''}
                </div>` : ''}
                <!-- Comment Thread Panel (hidden by default) -->
                <div class="pt-comment-panel" id="comment-panel-${t.id}" style="display:none;"></div>
            </div>`;
            }   // end inner for (const t of groups[st])
        }       // end outer for (const st of statusOrder)
        list.innerHTML = html;

        // Bind status select change handlers
        list.querySelectorAll('.pt-status-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const id = +sel.dataset.id;
                const newStatus = e.target.value;
                await this.changeStatus(id, newStatus);
            });
        });

        // Bind comment thread buttons
        list.querySelectorAll('.pt-comment-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = +btn.dataset.id;
                this.toggleCommentPanel(id);
            });
        });
    },

    async changeStatus(id, newStatus) {
        // F1.1: Single API call with both status and resolved
        const resolved = (newStatus === 'unavailable') ? 1 : 0;
        await API.put(`/pending-teachers/${id}`, { status: newStatus, resolved });
        
        const t = this.teachers.find(x => x.id === id);
        showToast(`${t?.name || 'Docente'} → ${TEACHER_STATUS[newStatus]?.label || newStatus}`, 'success');
        this.refresh();
    },

    async scheduleFromAgenda(id) {
        const t = this.teachers.find(x => x.id === id);
        if (!t) return;

        // Find the matching subject in the subjects list
        const matchSubject = this.subjects.find(s => 
            s.name === t.subject || 
            (t.subject_code && s.code === t.subject_code)
        );

        // Open the new assignment modal with pre-filled data
        Modals.openNewAssignment({
            teacher_name: t.name,
            phone: t.phone || '',
            subject_id: matchSubject?.id || null,
            pendingTeacherId: t.id  // Track which teacher to update
        });
    },

    async quickAdd() {
        const name = document.getElementById('qa-name').value.trim();
        const subjectSel = document.getElementById('qa-subject');
        const subjectOpt = subjectSel.options[subjectSel.selectedIndex];
        const subject = subjectSel.value.trim();
        const subject_code = subjectOpt?.dataset?.code || '';
        const subject_type = document.getElementById('qa-subject-type').value;
        const phone = document.getElementById('qa-phone').value.trim();
        const sede = document.getElementById('qa-sede').value;
        const is_external = (sede !== 'La Paz' && sede !== 'El Alto');

        if (!name || !subject) return showToast('Nombre y materia son requeridos', 'error');

        const result = await API.post('/pending-teachers', { name, subject, subject_code, subject_type, phone, sede, is_external });
        if (result.error) return showToast(result.error, 'error');

        // Clear fields
        document.getElementById('qa-name').value = '';
        document.getElementById('qa-subject').value = '';
        document.getElementById('qa-subject-type').value = 'Teórica';
        document.getElementById('qa-phone').value = '';
        document.getElementById('qa-sede').value = 'La Paz';

        showToast(`Docente "${name}" agregado`, 'success');
        this.refresh();
    },

    openModal() {
        this.editingId = null;
        document.getElementById('modal-pt-title').textContent = 'Agregar Docente';
        document.getElementById('input-pt-name').value = '';
        document.getElementById('input-pt-subject').value = '';
        document.getElementById('input-pt-subject-type').value = 'Teórica';
        document.getElementById('input-pt-phone').value = '';
        document.getElementById('input-pt-sede').value = 'La Paz';
        document.getElementById('input-pt-drive').value = '';
        document.getElementById('input-pt-notes').value = '';
        document.getElementById('input-pt-flight-ticket').value = '';
        document.getElementById('input-pt-flight-ticket-path').value = '';
        document.getElementById('btn-pt-view-flight-ticket').style.display = 'none';
        this.checkFlightTicketVisibility();
        Modals.open('modal-pending-teacher');
    },

    editTeacher(id) {
        const t = this.teachers.find(x => x.id === id);
        if (!t) return;
        this.editingId = id;
        document.getElementById('modal-pt-title').textContent = 'Editar Docente';
        document.getElementById('input-pt-name').value = t.name;
        // Match by name in select, fallback to first option
        const sel = document.getElementById('input-pt-subject');
        sel.value = t.subject || '';
        document.getElementById('input-pt-subject-type').value = t.subject_type || 'Teórica';
        document.getElementById('input-pt-phone').value = t.phone || '';
        document.getElementById('input-pt-sede').value = t.sede || 'La Paz';
        document.getElementById('input-pt-drive').value = t.drive_link || '';
        document.getElementById('input-pt-notes').value = t.notes || '';
        document.getElementById('input-pt-flight-ticket').value = '';
        document.getElementById('input-pt-flight-ticket-path').value = t.flight_ticket_path || '';
        if (t.flight_ticket_path) {
            document.getElementById('btn-pt-view-flight-ticket').href = '/api' + t.flight_ticket_path;
            document.getElementById('btn-pt-view-flight-ticket').style.display = '';
        } else {
            document.getElementById('btn-pt-view-flight-ticket').style.display = 'none';
        }
        this.checkFlightTicketVisibility();
        Modals.open('modal-pending-teacher');
    },

    async saveFromModal() {
        const name = document.getElementById('input-pt-name').value.trim();
        const subjectSel = document.getElementById('input-pt-subject');
        const subjectOpt = subjectSel.options[subjectSel.selectedIndex];
        const subject = subjectSel.value.trim();
        const subject_code = subjectOpt?.dataset?.code || '';
        const subject_type = document.getElementById('input-pt-subject-type').value;
        const phone = document.getElementById('input-pt-phone').value.trim();
        const sede = document.getElementById('input-pt-sede').value;
        const is_external = (sede !== 'La Paz' && sede !== 'El Alto');
        const drive_link = document.getElementById('input-pt-drive').value.trim();
        const notes = document.getElementById('input-pt-notes').value.trim();

        if (!name || !subject) return showToast('Nombre y materia son requeridos', 'error');

        let flight_ticket_path = document.getElementById('input-pt-flight-ticket-path').value || null;
        const ticketFile = document.getElementById('input-pt-flight-ticket').files[0];
        if (ticketFile) {
            const formData = new FormData();
            formData.append('file', ticketFile);
            const uploadRes = await fetch(`/api/uploads/ticket?token=${encodeURIComponent(localStorage.getItem('edtech_token'))}`, {
                method: 'POST',
                body: formData
            }).then(r => r.json()).catch(() => ({ error: 'Fallo al subir el archivo' }));
            
            if (uploadRes.error) return showToast(uploadRes.error, 'error');
            flight_ticket_path = uploadRes.path;
        }

        const data = { name, subject, subject_code, subject_type, phone, sede, is_external, drive_link, flight_ticket_path, notes };

        if (this.editingId) {
            await API.put(`/pending-teachers/${this.editingId}`, data);
            showToast('Docente actualizado', 'success');
        } else {
            const result = await API.post('/pending-teachers', data);
            if (result.error) return showToast(result.error, 'error');
            showToast(`Docente "${name}" agregado`, 'success');
        }

        Modals.closeAll();
        this.refresh();
    },

    async deleteTeacher(id) {
        const t = this.teachers.find(x => x.id === id);
        Calendar.showConfirm({
            title: 'Eliminar de Agenda',
            message: `¿Eliminar a "${t?.name || 'este docente'}" de la agenda?`
        }, async () => {
            await API.del(`/pending-teachers/${id}`);
            showToast('Docente eliminado', 'success');
            this.refresh();
        });
    },

    // ===== COMMENT THREAD =====

    _openCommentPanel: null, // track currently open panel id

    toggleCommentPanel(id) {
        const panel = document.getElementById(`comment-panel-${id}`);
        if (!panel) return;
        const isOpen = panel.style.display !== 'none';
        // Close any previously open panel
        if (this._openCommentPanel && this._openCommentPanel !== id) {
            const prev = document.getElementById(`comment-panel-${this._openCommentPanel}`);
            if (prev) prev.style.display = 'none';
        }
        if (isOpen) {
            panel.style.display = 'none';
            this._openCommentPanel = null;
        } else {
            panel.style.display = '';
            this._openCommentPanel = id;
            this.loadCommentPanel(id);
        }
    },

    async loadCommentPanel(teacherId) {
        const panel = document.getElementById(`comment-panel-${teacherId}`);
        if (!panel) return;
        panel.innerHTML = `<div style="padding:12px;color:var(--text-muted);font-size:12px;">Cargando comentarios...</div>`;

        const comments = await API.get(`/pending-teachers/${teacherId}/comments`);
        const teacher = this.teachers.find(t => t.id === teacherId);
        const canPost = App.user && ['admin','post_productor'].includes(App.user.role);
        const canReply = !!App.user; // any logged user can reply

        // Group: roots + their children
        const roots = comments.filter(c => !c.parent_id);
        const children = c => comments.filter(x => x.parent_id == c.id);

        const formatDate = str => {
            const d = new Date(str);
            return d.toLocaleDateString('es-BO', { day:'2-digit', month:'short' }) + ' ' +
                   d.toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit' });
        };

        const roleLabel = r => ({ admin:'Admin', post_productor:'Post-Prod', academica:'Académica' }[r] || r);

        const renderComment = (c, isChild = false) => {
            const isOwn = App.user && c.user_id == App.user.id;
            const canDelete = isOwn || (App.user && App.user.role === 'admin');
            const indent = isChild ? 'margin-left:28px;border-left:2px solid var(--border-light);padding-left:10px;' : '';
            return `
                <div class="pt-comment-item" style="${indent}margin-bottom:8px;" data-comment-id="${c.id}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="width:22px;height:22px;border-radius:50%;background:var(--accent-bg);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${(c.author_name||'?').charAt(0)}</span>
                            <strong style="font-size:12px;color:var(--text-primary);">${c.author_name}</strong>
                            <span style="font-size:10px;background:var(--bg-tertiary);padding:1px 6px;border-radius:3px;color:var(--text-muted);">${roleLabel(c.author_role)}</span>
                            <span style="font-size:10px;color:var(--text-muted);">${formatDate(c.created_at)}</span>
                        </div>
                        <div style="display:flex;gap:4px;">
                            ${!isChild && canReply ? `<button class="btn-sm btn-ghost pt-reply-btn" data-teacher="${teacherId}" data-parent="${c.id}" style="font-size:10px;padding:2px 8px;height:22px;">↩ Responder</button>` : ''}
                            ${canDelete ? `<button class="btn-icon pt-del-comment" data-teacher="${teacherId}" data-id="${c.id}" style="width:18px;height:18px;" title="Eliminar"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
                        </div>
                    </div>
                    <div style="font-size:13px;color:var(--text-primary);line-height:1.5;padding-left:28px;">${c.message}</div>
                    <!-- reply form placeholder -->
                    <div class="pt-reply-form" id="reply-form-${c.id}" style="display:none;margin-left:28px;margin-top:6px;"></div>
                    ${children(c).map(ch => renderComment(ch, true)).join('')}
                </div>`;
        };

        let html = `<div style="border-top:1px solid var(--border-light);padding:14px 0 4px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Hilo de comentarios (${comments.length})
            </div>`;

        if (roots.length === 0) {
            html += `<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Sin comentarios aún. ${canPost ? 'Sé el primero en dejar una nota.' : 'El Post-Productor aún no ha dejado comentarios.'}</p>`;
        } else {
            html += roots.map(c => renderComment(c)).join('');
        }

        // New root comment form (post_productor / admin only)
        if (canPost) {
            html += `<div style="margin-top:10px;display:flex;gap:8px;align-items:flex-end;">
                <textarea id="new-comment-${teacherId}" class="input textarea" rows="2" placeholder="Escribe una nota sobre este docente (falta guión, documentos, etc)..." style="font-size:12px;flex:1;resize:none;"></textarea>
                <button class="btn btn-primary pt-send-comment" data-teacher="${teacherId}" style="height:38px;white-space:nowrap;font-size:12px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Enviar
                </button>
            </div>`;
        }

        html += `</div>`;
        panel.innerHTML = html;

        // Bind send root comment
        panel.querySelectorAll('.pt-send-comment').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tid = +btn.dataset.teacher;
                const textarea = panel.querySelector(`#new-comment-${tid}`);
                const msg = textarea?.value.trim();
                if (!msg) return showToast('Escribe un mensaje', 'error');
                btn.disabled = true;
                const res = await API.post(`/pending-teachers/${tid}/comments`, { message: msg });
                btn.disabled = false;
                if (res.error) return showToast(res.error, 'error');
                showToast('Comentario enviado', 'success');
                this.loadCommentPanel(tid);
            });
        });

        // Bind reply buttons
        panel.querySelectorAll('.pt-reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tid = +btn.dataset.teacher;
                const parentId = +btn.dataset.parent;
                const replyForm = document.getElementById(`reply-form-${parentId}`);
                if (!replyForm) return;
                const isOpen = replyForm.style.display !== 'none';
                if (isOpen) { replyForm.style.display = 'none'; return; }
                replyForm.style.display = '';
                replyForm.innerHTML = `
                    <div style="display:flex;gap:6px;align-items:flex-end;">
                        <textarea class="input textarea reply-text" rows="2" placeholder="Responder..." style="font-size:12px;flex:1;resize:none;"></textarea>
                        <button class="btn btn-outline pt-send-reply" data-teacher="${tid}" data-parent="${parentId}" style="height:38px;font-size:12px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                    </div>`;

                replyForm.querySelector('.pt-send-reply').addEventListener('click', async (e) => {
                    const t2 = +e.currentTarget.dataset.teacher;
                    const p2 = +e.currentTarget.dataset.parent;
                    const msg2 = replyForm.querySelector('.reply-text')?.value.trim();
                    if (!msg2) return showToast('Escribe un mensaje', 'error');
                    e.currentTarget.disabled = true;
                    const res = await API.post(`/pending-teachers/${t2}/comments`, { message: msg2, parent_id: p2 });
                    e.currentTarget.disabled = false;
                    if (res.error) return showToast(res.error, 'error');
                    showToast('Respuesta enviada', 'success');
                    this.loadCommentPanel(t2);
                });
            });
        });

        // Bind delete comment buttons
        panel.querySelectorAll('.pt-del-comment').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tid = +btn.dataset.teacher;
                const cid = +btn.dataset.id;
                Calendar.showConfirm({ title: 'Eliminar comentario', message: '¿Eliminar este comentario?' }, async () => {
                    await API.del(`/comments/${cid}`);
                    showToast('Comentario eliminado', 'success');
                    this.loadCommentPanel(tid);
                });
            });
        });
    }
};

// Init when DOM is ready (after App.init)
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure Modals is initialized first
    setTimeout(() => PendingTeachers.init(), 100);
});
