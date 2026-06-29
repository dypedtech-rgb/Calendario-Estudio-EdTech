// ================================================
// Modals Module
// ================================================

const Modals = {
    currentAssignmentId: null,

    init() {
        // Close modal on overlay click or close buttons
        document.getElementById('modal-overlay').addEventListener('click', () => this.closeAll());
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => this.closeAll());
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeAll();
        });

        // Bind all modal triggers
        document.getElementById('btn-new-assignment').addEventListener('click', () => this.openNewAssignment());
        document.getElementById('btn-close-week').addEventListener('click', () => this.openCloseWeek());
        document.getElementById('btn-manage-semester').addEventListener('click', () => this.openSemesterManager());
        document.getElementById('btn-add-subject').addEventListener('click', () => this.openAddSubject());
        document.getElementById('btn-bulk-import').addEventListener('click', () => this.openBulkImport());
        document.getElementById('btn-delete-all-subjects')?.addEventListener('click', () => Goals.deleteAllSubjects());
        document.getElementById('btn-settings').addEventListener('click', () => this.openSemesterManager());
        document.getElementById('btn-new-reservation')?.addEventListener('click', () => this.openNewReservation());

        // Save handlers
        document.getElementById('btn-create-semester').addEventListener('click', () => this.createSemester());
        document.getElementById('btn-save-subject').addEventListener('click', () => this.saveSubject());
        document.getElementById('btn-do-import').addEventListener('click', () => this.doBulkImport());
        document.getElementById('btn-save-assignment').addEventListener('click', () => this.saveAssignment());
        document.getElementById('btn-do-close-week').addEventListener('click', () => this.doCloseWeek());
        document.getElementById('btn-save-session').addEventListener('click', () => this.saveNewSession());
        document.getElementById('btn-detail-add-session').addEventListener('click', () => this.openAddSession());
        document.getElementById('btn-detail-complete').addEventListener('click', () => this.markComplete());
        document.getElementById('btn-save-reservation')?.addEventListener('click', () => this.saveReservation());
        document.getElementById('btn-save-edit-session')?.addEventListener('click', () => this.saveEditSession());

        // Pending teachers integration
        document.getElementById('input-select-pending')?.addEventListener('change', (e) => {
            if (!e.target.value) {
                document.getElementById('input-teacher-name').value = '';
                document.getElementById('input-teacher-phone').value = '';
                document.getElementById('input-assignment-subject').value = '';
                return;
            }
            const pt = Modals.pendingTeachersData?.find(t => t.id == e.target.value);
            if (pt) {
                document.getElementById('input-teacher-name').value = pt.name;
                document.getElementById('input-teacher-phone').value = pt.phone || '';
                
                const subjectSelect = document.getElementById('input-assignment-subject');
                const subjectOptions = Array.from(subjectSelect.options);
                
                const normalize = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                const ptSubj = normalize(pt.subject);
                const ptCode = pt.subject_code ? normalize(pt.subject_code) : null;
                
                // Find best match
                let match = subjectOptions.find(opt => {
                    const optText = normalize(opt.text);
                    if (ptCode && optText.includes(ptCode)) return true;
                    return optText === ptSubj || optText.includes(ptSubj) || ptSubj.includes(optText);
                });
                
                if (match) {
                    subjectSelect.value = match.value;
                } else {
                    subjectSelect.value = '';
                }
                
                if (pt.sede) {
                    const sedeSelect = document.getElementById('input-assignment-sede');
                    if (sedeSelect) {
                        sedeSelect.value = pt.sede;
                        Modals.checkFlightTicketVisibility();
                    }
                }
                
                // Auto-fill drive link if available
                const driveLinkInput = document.getElementById('input-drive-link');
                if (driveLinkInput && pt.drive_link) {
                    driveLinkInput.value = pt.drive_link;
                }

                // Show flight ticket info if already uploaded
                if (pt.flight_ticket_path) {
                    const ticketRow = document.getElementById('flight-ticket-container');
                    if (ticketRow) {
                        ticketRow.style.display = 'block'; // Make sure it's visible
                        // Show an existing ticket notice
                        let notice = document.getElementById('existing-ticket-notice');
                        if (!notice) {
                            notice = document.createElement('div');
                            notice.id = 'existing-ticket-notice';
                            notice.style.cssText = 'font-size:11px;color:var(--purple);background:var(--purple-bg);border:1px solid rgba(188,140,255,0.2);border-radius:6px;padding:6px 10px;margin-top:6px;display:flex;align-items:center;gap:6px;';
                            notice.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Ya tiene pasaje cargado — <a href="/api${pt.flight_ticket_path}" target="_blank" style="color:var(--purple);font-weight:600;">Ver Pasaje</a>`;
                            ticketRow.appendChild(notice);
                        } else {
                            notice.style.display = 'flex';
                            notice.querySelector('a').href = `/api${pt.flight_ticket_path}`;
                        }
                        // Store path so it gets saved
                        Modals._existingTicketPath = pt.flight_ticket_path;
                    }
                } else {
                    const notice = document.getElementById('existing-ticket-notice');
                    if (notice) notice.style.display = 'none';
                    Modals._existingTicketPath = null;
                }
            }
        });
    },

    open(modalId) {
        document.getElementById('modal-overlay').classList.add('active');
        document.getElementById(modalId).classList.add('active');
    },

    closeAll() {
        // Si el modal de detalle está abierto, guardar bitácora antes de cerrar
        const detailModal = document.getElementById('modal-detail');
        if (detailModal && detailModal.classList.contains('active') && this.currentAssignmentId) {
            const textarea = document.getElementById('assignment-bitacora');
            if (textarea) {
                // Guardar de forma "fire-and-forget" — no bloquear el cierre
                const value = textarea.value;
                const id = this.currentAssignmentId;
                API.put(`/assignments/${id}`, { bitacora: value }).catch(() => {});
            }
        }
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('modal-overlay').classList.remove('active');
        this.currentAssignmentId = null;
        this.currentReservationId = null;
        document.querySelectorAll('.modal-body').forEach(b => b.scrollTop = 0);
    },

    // ===== Custom Date Picker (Monday-first, matches main calendar) =====
    convertToDatePicker(inputId) {
        const el = document.getElementById(inputId);
        if (!el || el.dataset.datepickerDone) return;
        el.dataset.datepickerDone = '1';

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-datepicker-wrapper';
        wrapper.style.cssText = 'position:relative;';

        // Visible text input (readonly, acts as trigger)
        const display = document.createElement('input');
        display.type = 'text';
        display.className = 'input';
        display.readOnly = true;
        display.placeholder = 'Seleccionar fecha…';
        display.style.cursor = 'pointer';

        // Hidden real input (preserves the original id and value)
        el.style.display = 'none';
        display.value = el.value ? (() => { const [y,m,d] = el.value.split('-'); return `${d}/${m}/${y}`; })() : '';

        // Dropdown calendar panel
        const panel = document.createElement('div');
        panel.className = 'custom-datepicker-panel';
        panel.style.display = 'none';

        let pickerYear, pickerMonth;
        const today = new Date();

        const renderPanel = (year, month) => {
            pickerYear = year; pickerMonth = month;
            const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            const dayHeaders = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            let startOffset = firstDay.getDay() - 1;
            if (startOffset < 0) startOffset = 6;
            const selectedVal = el.value;

            let html = `<div class="dp-header">
                <button class="dp-nav" data-dir="-1">&#8249;</button>
                <span class="dp-month-label">${monthNames[month]} ${year}</span>
                <button class="dp-nav" data-dir="1">&#8250;</button>
            </div>
            <div class="dp-grid">
                ${dayHeaders.map(d => `<div class="dp-day-header">${d}</div>`).join('')}`;

            // Prev month padding
            const prevLast = new Date(year, month, 0).getDate();
            for (let i = startOffset - 1; i >= 0; i--) {
                html += `<div class="dp-day dp-other">${prevLast - i}</div>`;
            }
            // Current month days
            for (let d = 1; d <= lastDay.getDate(); d++) {
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const isToday = dateStr === `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
                const isSelected = dateStr === selectedVal;
                const dow = new Date(year, month, d).getDay();
                const isWeekend = dow === 0 || dow === 6;
                let cls = 'dp-day';
                if (isToday) cls += ' dp-today';
                if (isSelected) cls += ' dp-selected';
                if (isWeekend) cls += ' dp-weekend';
                html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
            }
            // Next month padding
            const totalShown = startOffset + lastDay.getDate();
            const remaining = totalShown % 7 === 0 ? 0 : 7 - (totalShown % 7);
            for (let i = 1; i <= remaining; i++) {
                html += `<div class="dp-day dp-other">${i}</div>`;
            }
            html += `</div>`;
            panel.innerHTML = html;

            // Nav buttons
            panel.querySelectorAll('.dp-nav').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    let m = pickerMonth + parseInt(btn.dataset.dir);
                    let y = pickerYear;
                    if (m < 0) { m = 11; y--; }
                    if (m > 11) { m = 0; y++; }
                    renderPanel(y, m);
                });
            });

            // Day clicks
            panel.querySelectorAll('.dp-day:not(.dp-other)').forEach(day => {
                day.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dateStr = day.dataset.date;
                    el.value = dateStr;
                    const [y, m, d] = dateStr.split('-');
                    display.value = `${d}/${m}/${y}`;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    panel.style.display = 'none';
                    renderPanel(pickerYear, pickerMonth); // re-render to show selection
                });
            });
        };

        display.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = panel.style.display !== 'none';
            document.querySelectorAll('.custom-datepicker-panel').forEach(p => p.style.display = 'none');
            if (!isOpen) {
                const initDate = el.value ? new Date(el.value + 'T12:00:00') : today;
                renderPanel(initDate.getFullYear(), initDate.getMonth());
                panel.style.display = 'block';
            }
        });

        document.addEventListener('click', () => { panel.style.display = 'none'; });

        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(display);
        wrapper.appendChild(el);
        wrapper.appendChild(panel);
    },

    // Convert all date inputs in a modal to custom pickers
    initDatePickers(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.querySelectorAll('input[type="date"]').forEach(inp => {
            this.convertToDatePicker(inp.id);
        });
    },

    // ===== Dynamic Time Select Helpers =====
    convertToTimeSelect(inputId) {
        const el = document.getElementById(inputId);
        if (!el || el.tagName === 'SELECT') return;
        const parent = el.parentNode;
        const select = document.createElement('select');
        select.id = el.id;
        select.className = 'input select';
        select.required = el.required;
        const val = el.value;
        for (let h = 8; h <= 20; h++) {
            for (let m = 0; m < 60; m += 30) {
                const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const opt = document.createElement('option');
                opt.value = time;
                opt.textContent = time;
                select.appendChild(opt);
            }
        }
        select.value = val || '08:00';
        parent.replaceChild(select, el);
    },

    limitTimeOptions(dateStr) {
        const status = this._availData[dateStr] || 'free';
        // Currently the availability grid is only used in Add Session, but let's apply generically if inputs exist
        const startIds = ['input-new-session-start', 'input-session-start', 'input-session2-start'];
        const endIds = ['input-new-session-end', 'input-session-end', 'input-session2-end'];

        [...startIds, ...endIds].forEach(id => {
            const select = document.getElementById(id);
            if (!select || select.tagName !== 'SELECT') return;
            
            // Only affect the select if it's currently visible/active in a modal
            const modal = select.closest('.modal');
            if (modal && !modal.classList.contains('active')) return;

            const currentVal = select.value;
            let firstValid = null;

            Array.from(select.options).forEach(o => {
                const t = o.value;
                o.disabled = false;
                if (status === 'full') o.disabled = true;
                else if (status === 'morning_busy' && t < '13:00') o.disabled = true;
                else if (status === 'afternoon_busy' && t >= '13:00') o.disabled = true;

                if (!o.disabled && !firstValid) firstValid = t;
            });

            // Adjust selection if current is disabled
            const currentOpt = Array.from(select.options).find(o => o.value === currentVal);
            if (currentOpt && currentOpt.disabled && firstValid) {
                select.value = firstValid;
            }
        });
    },

    // ===== SEMESTER MANAGER =====

    async openSemesterManager() {
        this.open('modal-semester');
        const semesters = await API.get('/semesters');
        const list = document.getElementById('semester-list');
        if (semesters.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No hay semestres creados</p>';
            return;
        }
        list.innerHTML = semesters.map(s => `
            <div class="semester-item ${s.is_active ? 'is-active' : ''}">
                <span class="semester-item-name">${s.name} ${s.is_active ? '(Activo)' : ''}</span>
                <div class="semester-item-actions">
                    ${!s.is_active ? `<button class="btn-sm btn-outline" onclick="Modals.activateSemester(${s.id})">Activar</button>` : ''}
                    <button class="btn-icon" onclick="Modals.deleteSemester(${s.id})" title="Eliminar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `).join('');
    },

    async createSemester() {
        const name = document.getElementById('input-semester-name').value.trim();
        if (!name) return showToast('Ingresa un nombre', 'error');
        const result = await API.post('/semesters', { name });
        if (result.error) return showToast(result.error, 'error');
        document.getElementById('input-semester-name').value = '';
        showToast(`Semestre "${name}" creado`, 'success');
        await App.loadActiveSemester();
        this.openSemesterManager();
        Dashboard.refresh();
        Calendar.render();
    },

    async activateSemester(id) {
        await API.put(`/semesters/${id}/activate`);
        await App.loadActiveSemester();
        showToast('Semestre activado', 'success');
        this.openSemesterManager();
        Dashboard.refresh();
        Calendar.render();
        Goals.refresh();
    },

    async deleteSemester(id) {
        Calendar.showConfirm({
            title: 'Eliminar Semestre',
            message: '¿Eliminar este semestre y todas sus materias? Esta acción no se puede deshacer.'
        }, async () => {
            await API.del(`/semesters/${id}`);
            await App.loadActiveSemester();
            showToast('Semestre eliminado', 'success');
            this.openSemesterManager();
            Dashboard.refresh();
            Calendar.render();
        });
    },

    // ===== ADD SUBJECT =====

    openAddSubject() {
        if (!App.activeSemester) return showToast('Primero crea un semestre', 'error');
        document.getElementById('input-subject-name').value = '';
        this.open('modal-subject');
    },

    async saveSubject() {
        const name = document.getElementById('input-subject-name').value.trim();
        const subject_type = document.getElementById('input-subject-type-select')?.value || 'Teórica';
        if (!name) return showToast('Ingresa el nombre o materia', 'error');
        const result = await API.post('/subjects', { name, subject_type, semester_id: App.activeSemester.id });
        if (result.error) return showToast(result.error, 'error');
        showToast(`Materia agregada`, 'success');
        this.closeAll();
        Goals.refresh();
        Dashboard.refresh();
    },

    // ===== BULK IMPORT (with Preview) =====

    parsedSubjects: [], // Holds the parsed preview data

    openBulkImport() {
        if (!App.activeSemester) return showToast('Primero crea un semestre', 'error');
        document.getElementById('input-bulk-text').value = '';
        
        // Reset to Step 1
        document.getElementById('import-step-input').style.display = '';
        document.getElementById('import-step-preview').style.display = 'none';
        document.getElementById('btn-preview-import').style.display = '';
        document.getElementById('btn-do-import').style.display = 'none';
        this.parsedSubjects = [];

        const fileInput = document.getElementById('input-bulk-file');
        const fileNameDisplay = document.getElementById('bulk-file-name');
        if (fileInput) {
            fileInput.value = '';
            fileNameDisplay.textContent = '';
            
            if (!fileInput.dataset.bound) {
                fileInput.addEventListener('change', function(e) {
                    const file = e.target.files[0];
                    if (!file) return;
                    fileNameDisplay.textContent = `Archivo seleccionado: ${file.name}`;
                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        document.getElementById('input-bulk-text').value = evt.target.result;
                    };
                    reader.onerror = function() {
                        showToast('Error al leer el archivo CSV', 'error');
                    };
                    reader.readAsText(file);
                });
                fileInput.dataset.bound = 'true';
            }
        }

        // Bind preview button (once)
        if (!document.getElementById('btn-preview-import').dataset.bound) {
            document.getElementById('btn-preview-import').addEventListener('click', () => this.showImportPreview());
            document.getElementById('btn-back-to-input').addEventListener('click', () => {
                document.getElementById('import-step-input').style.display = '';
                document.getElementById('import-step-preview').style.display = 'none';
                document.getElementById('btn-preview-import').style.display = '';
                document.getElementById('btn-do-import').style.display = 'none';
            });
            document.getElementById('btn-preview-import').dataset.bound = 'true';
        }
        
        this.open('modal-bulk-import');
    },

    // Proper CSV line parser that respects quoted fields
    parseCSVLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++; // skip escaped quote
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    fields.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        fields.push(current.trim());
        return fields;
    },

    parseBulkText(text) {
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const lines = text.split('\n').filter(l => {
            const t = l.trim().toLowerCase();
            return t && !t.startsWith('codigo') && !t.startsWith('código') && !t.startsWith('materia') && !t.startsWith('code');
        });

        const subjects = [];
        const seen = new Set();

        for (const line of lines) {
            let code = '', name = '', subject_type = 'Teórica';

            if (line.includes('\t')) {
                const parts = line.split('\t').map(p => p.trim());
                code = parts[0] || '';
                name = parts[1] || '';
                if (parts[2]) subject_type = parts[2];
            } else if (line.includes(',')) {
                const parts = this.parseCSVLine(line);
                code = parts[0] || '';
                name = parts[1] || '';
                if (parts[2]) subject_type = parts[2];
            } else {
                const trimmed = line.trim();
                const match = trimmed.match(/^([A-Za-z\.\s]+-?\s*\d+)\s+(.+)$/);
                if (match) {
                    code = match[1];
                    name = match[2];
                } else {
                    continue;
                }
            }

            if (!code || !name) continue;

            // Normalize type
            const typeNorm = subject_type.toLowerCase().trim();
            if (typeNorm.includes('numérica') || typeNorm.includes('numerica')) {
                subject_type = 'Numérica';
            } else if (typeNorm.includes('integrador')) {
                subject_type = 'Proyecto Integrador';
            } else if (typeNorm.includes('p.')) {
                subject_type = 'Proyecto Integrador';
            } else {
                subject_type = 'Teórica';
            }

            // Normalize code: remove spaces and dots before dash, uppercase
            const normalizedCode = code.replace(/[\s\.]+/g, '').replace(/(\w+)\s*-\s*(\d+)/, '$1-$2').toUpperCase().trim();

            // Deduplicate by normalized code+name (case-insensitive)
            const key = (normalizedCode + '|' + name.trim()).toUpperCase();
            if (seen.has(key)) continue;
            seen.add(key);

            subjects.push({ code: normalizedCode, name: name.trim(), subject_type, checked: true });
        }

        return subjects;
    },

    async showImportPreview() {
        const text = document.getElementById('input-bulk-text').value.trim();
        if (!text) return showToast('Pega la lista de materias o sube un CSV', 'error');

        const subjects = this.parseBulkText(text);
        if (subjects.length === 0) return showToast('No se pudieron parsear las materias', 'error');

        // Check for existing subjects in this semester
        const existing = await API.get(`/subjects?semester_id=${App.activeSemester.id}`);
        const existingKeys = new Set(existing.map(s => (s.code + '|' + s.name).toUpperCase()));

        let dupCount = 0;
        for (const s of subjects) {
            const key = (s.code + '|' + s.name).toUpperCase();
            if (existingKeys.has(key)) {
                s.isDuplicate = true;
                s.checked = false;
                dupCount++;
            }
        }

        this.parsedSubjects = subjects;

        // Render preview table
        const typeColors = {
            'Teórica':   { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
            'Numérica':  { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
            'Proyecto Integrador': { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
        };

        let tableHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
                <tr style="background:var(--bg-secondary);position:sticky;top:0;z-index:1;">
                    <th style="padding:8px 10px;text-align:center;width:40px;">
                        <input type="checkbox" id="import-check-all" checked style="accent-color:var(--accent);" onchange="Modals.toggleAllImportChecks(this.checked)">
                    </th>
                    <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text-secondary);">Código</th>
                    <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text-secondary);">Materia</th>
                    <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text-secondary);">Tipo</th>
                    <th style="padding:8px 10px;text-align:center;font-weight:600;color:var(--text-secondary);width:80px;">Estado</th>
                </tr>
            </thead>
            <tbody>`;

        subjects.forEach((s, i) => {
            const tc = typeColors[s.subject_type] || typeColors['Teórica'];
            const rowBg = s.isDuplicate ? 'rgba(251,191,36,0.05)' : '';
            tableHTML += `<tr style="border-bottom:1px solid var(--border-light);background:${rowBg};" data-idx="${i}">
                <td style="padding:6px 10px;text-align:center;">
                    <input type="checkbox" class="import-row-check" data-idx="${i}" ${s.checked ? 'checked' : ''} style="accent-color:var(--accent);" onchange="Modals.toggleImportCheck(${i}, this.checked)">
                </td>
                <td style="padding:6px 10px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);">${s.code}</td>
                <td style="padding:6px 10px;color:var(--text-primary);">${s.name}</td>
                <td style="padding:6px 10px;">
                    <span style="background:${tc.bg};color:${tc.color};font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;">${s.subject_type}</span>
                </td>
                <td style="padding:6px 10px;text-align:center;">
                    ${s.isDuplicate 
                        ? '<span style="background:rgba(251,191,36,0.15);color:#fbbf24;font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;">Ya existe</span>' 
                        : '<span style="background:rgba(52,211,153,0.15);color:#34d399;font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;">Nueva</span>'}
                </td>
            </tr>`;
        });

        tableHTML += '</tbody></table>';

        document.getElementById('import-preview-table').innerHTML = tableHTML;
        document.getElementById('preview-count-label').textContent = `${subjects.length} materias detectadas`;
        document.getElementById('preview-dup-label').textContent = dupCount > 0 ? `${dupCount} ya existen en el semestre` : '';

        // Switch to Step 2
        document.getElementById('import-step-input').style.display = 'none';
        document.getElementById('import-step-preview').style.display = '';
        document.getElementById('btn-preview-import').style.display = 'none';
        document.getElementById('btn-do-import').style.display = '';

        this.updateImportButtonCount();
    },

    toggleAllImportChecks(checked) {
        this.parsedSubjects.forEach(s => s.checked = checked);
        document.querySelectorAll('.import-row-check').forEach(cb => cb.checked = checked);
        this.updateImportButtonCount();
    },

    toggleImportCheck(idx, checked) {
        this.parsedSubjects[idx].checked = checked;
        this.updateImportButtonCount();
    },

    updateImportButtonCount() {
        const count = this.parsedSubjects.filter(s => s.checked).length;
        const btn = document.getElementById('btn-do-import');
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Importar ${count} materias`;
    },

    async doBulkImport() {
        const subjects = this.parsedSubjects.filter(s => s.checked);
        if (subjects.length === 0) return showToast('Selecciona al menos una materia', 'error');

        const replace = document.getElementById('import-replace-mode').checked;

        const result = await API.post('/subjects/bulk', {
            subjects: subjects.map(s => ({ code: s.code, name: s.name, subject_type: s.subject_type })),
            semester_id: App.activeSemester.id,
            replace
        });
        const results = result.results || result;
        const successCount = Array.isArray(results) ? results.filter(r => r.success || !r.error).length : 0;
        const skippedCount = Array.isArray(results) ? results.filter(r => r.skipped).length : 0;
        const deletedCount = result.deleted || 0;

        let msg = '';
        if (deletedCount > 0) msg += `${deletedCount} anteriores borradas · `;
        msg += `${successCount} importadas`;
        if (skippedCount > 0) msg += ` · ${skippedCount} omitidas (duplicadas)`;
        showToast(msg, 'success');
        this.closeAll();
        Goals.refresh();
        Dashboard.refresh();
    },

    pendingTeacherId: null, // Track which agenda teacher we're scheduling

    checkFlightTicketVisibility() {
        const sede = document.getElementById('input-assignment-sede').value;
        const container = document.getElementById('flight-ticket-container');
        if (container) {
            if (sede && sede !== 'La Paz' && sede !== 'El Alto') {
                container.style.display = '';
            } else {
                container.style.display = 'none';
            }
        }
    },

    async openNewAssignment(prefillData = null) {
        if (!App.activeSemester) return showToast('Primero crea un semestre', 'error');
        
        this.pendingTeacherId = prefillData?.pendingTeacherId || null;

        // Reset form
        document.getElementById('input-teacher-name').value = prefillData?.teacher_name || '';
        document.getElementById('input-teacher-phone').value = prefillData?.phone || '';
        document.getElementById('input-drive-link').value = '';
        const scriptStatusEl = document.getElementById('input-script-status');
        if (scriptStatusEl) scriptStatusEl.value = 'not_uploaded';
        
        const hitoEl = document.getElementById('input-session-hito');
        if (hitoEl) hitoEl.value = '';
        
        const staffEl = document.getElementById('input-assigned-staff');
        if (staffEl) staffEl.value = '';
        
        const staff2El = document.getElementById('input-assigned-staff-2');
        if (staff2El) staff2El.value = '';

        document.getElementById('input-assignment-sede').value = prefillData?.sede || 'La Paz';
        document.getElementById('input-flight-ticket').value = '';
        document.getElementById('input-flight-ticket-path').value = '';
        document.getElementById('btn-view-flight-ticket').style.display = 'none';
        this.checkFlightTicketVisibility();

        // Load subjects into dropdown
        const subjects = await API.get(`/subjects?semester_id=${App.activeSemester.id}`);
        const select = document.getElementById('input-assignment-subject');
        select.innerHTML = '<option value="">Seleccionar materia...</option>';
        subjects.filter(s => !s.completed).forEach(s => {
            const typeLabel = s.subject_type ? ` [${s.subject_type}]` : '';
            select.innerHTML += `<option value="${s.id}">${s.code} — ${s.name}${typeLabel}</option>`;
        });

        // Pre-select subject if provided
        if (prefillData?.subject_id) {
            select.value = prefillData.subject_id;
        }

        // Load pending teachers (always show this section)
        const pendingTeachers = await API.get('/pending-teachers?resolved=1');
        Modals.pendingTeachersData = pendingTeachers;
        const ptSelect = document.getElementById('input-select-pending');
        const ptRow = document.getElementById('row-select-pending');
        ptSelect.innerHTML = '<option value="">-- Ingreso manual --</option>';
        pendingTeachers.filter(t => !t.status || t.status === 'pending' || t.status === 'contacted' || t.status === 'guion_revisado').forEach(t => {
            const typeTag = t.subject_type ? ` · ${t.subject_type}` : '';
            ptSelect.innerHTML += `<option value="${t.id}">${t.name} — ${t.subject_code || ''} ${t.subject}${typeTag}</option>`;
        });
        ptRow.style.display = ''; // always visible
        
        // If coming from agenda, pre-select the pending teacher
        if (this.pendingTeacherId) {
            ptSelect.value = this.pendingTeacherId;
        }

        // Load post-production users into "Asignado a"
        const staffUsers = await API.get('/staff', true);
        const staffSelect = document.getElementById('input-assigned-staff');
        const staff2Select = document.getElementById('input-assigned-staff-2');
        if (staffSelect) staffSelect.innerHTML = '<option value="">-- Sin asignar --</option>';
        if (staff2Select) staff2Select.innerHTML = '<option value="">-- Ninguno --</option>';
        if (Array.isArray(staffUsers)) {
            staffUsers.forEach(u => {
                if (staffSelect) staffSelect.innerHTML += `<option value="${u.id}">${u.name || u.username}</option>`;
                if (staff2Select) staff2Select.innerHTML += `<option value="${u.id}">${u.name || u.username}</option>`;
            });
        }

        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('input-session-date').value = today;

        // Reset second session block
        const s2block = document.getElementById('session-2-block');
        if (s2block) s2block.style.display = 'none';
        const s2date = document.getElementById('input-session2-date');
        if (s2date) s2date.value = '';
        
        ['input-session-start', 'input-session-end', 'input-session2-start', 'input-session2-end'].forEach(id => this.convertToTimeSelect(id));
        document.getElementById('input-session-start').value = '08:00';
        document.getElementById('input-session-end').value = '10:00';
        document.getElementById('input-session2-start').value = '08:00';
        document.getElementById('input-session2-end').value = '10:00';
        
        const s2hito = document.getElementById('input-session2-hito');
        if (s2hito) s2hito.value = '';

        document.getElementById('modal-assignment-title').textContent = this.pendingTeacherId ? 'Agendar Filmación desde Agenda' : 'Nueva Filmación';
        this.open('modal-assignment');
        this.initDatePickers('modal-assignment');
    },

    toggleSecondSession() {
        const block = document.getElementById('session-2-block');
        if (!block) return;
        const isHidden = block.style.display === 'none';
        block.style.display = isHidden ? '' : 'none';
        if (isHidden) {
            // Pre-fill next day
            const d1 = document.getElementById('input-session-date').value;
            if (d1) {
                const next = new Date(d1 + 'T12:00:00');
                next.setDate(next.getDate() + 1);
                document.getElementById('input-session2-date').value = next.toISOString().split('T')[0];
            }
            document.getElementById('input-session2-start').value = document.getElementById('input-session-start').value || '08:00';
            document.getElementById('input-session2-end').value = document.getElementById('input-session-end').value || '10:00';
        }
    },

    async saveAssignment() {
        const teacher_name = document.getElementById('input-teacher-name').value.trim();
        const phone = document.getElementById('input-teacher-phone').value.trim();
        const subject_id = document.getElementById('input-assignment-subject').value;
        const drive_link = document.getElementById('input-drive-link')?.value.trim();
        const script_status = document.getElementById('input-script-status')?.value || 'not_uploaded';
        const sede = document.getElementById('input-assignment-sede').value;

        if (!teacher_name || !subject_id) return showToast('Nombre del docente y materia son requeridos', 'error');

        let flight_ticket_path = null;
        const ticketFile = document.getElementById('input-flight-ticket').files[0];
        if (ticketFile) {
            const formData = new FormData();
            formData.append('file', ticketFile);
            const uploadRes = await fetch(`/api/uploads/ticket?token=${encodeURIComponent(localStorage.getItem('edtech_token'))}`, {
                method: 'POST',
                body: formData
            }).then(r => r.json()).catch(() => ({ error: 'Fallo al subir el archivo' }));
            
            if (uploadRes.error) return showToast(uploadRes.error, 'error');
            flight_ticket_path = uploadRes.path;
        } else if (this._existingTicketPath) {
            // Inherit ticket from pending teacher agenda
            flight_ticket_path = this._existingTicketPath;
        }

        const session_date = document.getElementById('input-session-date').value;
        const start_time = document.getElementById('input-session-start').value;
        const end_time = document.getElementById('input-session-end').value;
        const hito_reached = document.getElementById('input-session-hito')?.value || null;

        const session = (session_date && start_time && end_time) ? { session_date, start_time, end_time, hito_reached } : null;

        const pending_teacher_id = this.pendingTeacherId || document.getElementById('input-select-pending')?.value || null;
        const staff_2_id = document.getElementById('input-assigned-staff-2')?.value || null;
        const result = await API.post('/assignments', { teacher_name, phone, subject_id, drive_link, script_status, session, pending_teacher_id, staff_2_id, sede, flight_ticket_path });
        if (result.error) return showToast(result.error, 'error');

        // Save second session if provided
        const s2block = document.getElementById('session-2-block');
        if (s2block && s2block.style.display !== 'none') {
            const session2_date = document.getElementById('input-session2-date').value;
            const session2_start = document.getElementById('input-session2-start').value;
            const session2_end = document.getElementById('input-session2-end').value;
            const session2_hito = document.getElementById('input-session2-hito')?.value || null;
            if (session2_date && session2_start && session2_end) {
                const staff1Val = document.getElementById('input-assigned-staff')?.value || null;
                const staff2Val = document.getElementById('input-assigned-staff-2')?.value || null;
                const s2res = await API.post('/sessions', {
                    assignment_id: result.id,
                    session_date: session2_date,
                    start_time: session2_start,
                    end_time: session2_end,
                    hito_reached: session2_hito,
                    staff_1_id: staff1Val,
                    staff_2_id: staff2Val
                });
                if (s2res.error) {
                    if (s2res.error.includes('Conflicto')) alert('Error 2ª sesión: ' + s2res.error);
                    showToast(`2ª sesión: ${s2res.error}`, 'error');
                }
            }
        }

        // Update the pending teacher status to 'scheduled'
        const pendingId = this.pendingTeacherId || document.getElementById('input-select-pending')?.value;
        if (pendingId) {
            await API.put(`/pending-teachers/${pendingId}`, { status: 'scheduled', resolved: 0 });
            if (typeof PendingTeachers !== 'undefined') {
                PendingTeachers.refresh();
            }
        }
        this.pendingTeacherId = null;

        showToast('Filmación creada exitosamente', 'success');
        this.closeAll();
        Calendar.render();
        Dashboard.refresh();
        if (App.currentView === 'goals') Goals.refresh();
    },

    currentReservationId: null,

    async openNewReservation() {
        if (!App.activeSemester) return showToast('Primero crea un semestre', 'error');
        this.currentReservationId = null;

        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('input-res-date').value = today;
        document.getElementById('input-res-end-date').value = today;
        document.getElementById('input-res-end-date').parentElement.style.display = 'block';
        document.getElementById('reservation-error').style.display = 'none';
        
        document.querySelector('#modal-reservation h3').textContent = 'Nueva Reserva';

        // Reset displacement
        const dispCb = document.getElementById('input-res-displacement');
        if (dispCb) dispCb.checked = false;
        this._updateDisplacementUI(false);

        // Load staff and reset attendees
        document.getElementById('input-res-reason').value = '';
        document.getElementById('attendees-list').innerHTML = '';
        ['input-res-start', 'input-res-end'].forEach(id => this.convertToTimeSelect(id));
        
        Calendar._staffUsers = await API.get('/staff');

        this.open('modal-reservation');
        this.initDatePickers('modal-reservation');
    },

    async openEditReservation(r) {
        this.currentReservationId = r.id;
        
        document.getElementById('input-res-date').value = r.date;
        document.getElementById('input-res-end-date').value = r.date;
        document.getElementById('input-res-end-date').parentElement.style.display = 'block';
        
        // Convert to selects
        ['input-res-start', 'input-res-end'].forEach(id => this.convertToTimeSelect(id));
        document.getElementById('input-res-start').value = r.start_time.substring(0, 5);
        document.getElementById('input-res-end').value = r.end_time.substring(0, 5);
        
        document.getElementById('input-res-reason').value = r.reason;
        document.getElementById('reservation-error').style.display = 'none';
        
        // Displacement state
        const isDisp = r.is_displacement == 1 || r.is_displacement === true;
        const dispCb = document.getElementById('input-res-displacement');
        if (dispCb) dispCb.checked = isDisp;
        this._updateDisplacementUI(isDisp);
        
        document.querySelector('#modal-reservation h3').textContent = 'Editar Reserva';
        
        // Load staff then populate attendees
        Calendar._staffUsers = await API.get('/staff');
        const attendeesList = document.getElementById('attendees-list');
        attendeesList.innerHTML = '';
        let existingAttendees = [];
        if (r.attendees) {
            try { existingAttendees = typeof r.attendees === 'string' ? JSON.parse(r.attendees) : r.attendees; } catch(e) {}
        }
        existingAttendees.forEach(a => Calendar.addAttendeeField(a));
        
        this.open('modal-reservation');
        this.initDatePickers('modal-reservation');
    },

    // Displacement toggle helper
    toggleDisplacement() {
        const cb = document.getElementById('input-res-displacement');
        if (!cb) return;
        cb.checked = !cb.checked;
        this._updateDisplacementUI(cb.checked);
    },

    _updateDisplacementUI(isOn) {
        const sw = document.getElementById('displacement-switch-visual');
        const knob = document.getElementById('displacement-knob');
        const info = document.getElementById('displacement-info');
        const statusText = document.getElementById('displacement-status-text');
        if (sw) sw.style.background = isOn ? '#fbbf24' : 'var(--border)';
        if (knob) knob.style.transform = isOn ? 'translateX(20px)' : 'translateX(0)';
        if (info) info.style.display = isOn ? 'block' : 'none';
        if (statusText) statusText.innerHTML = isOn ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;vertical-align:middle"><polyline points="20 6 9 17 4 12"></polyline></svg> queda LIBRE' : 'queda ocupado';
        if (statusText) statusText.style.color = isOn ? '#fbbf24' : '';
    },

    async saveReservation() {
        const start_date = document.getElementById('input-res-date').value;
        const end_date = document.getElementById('input-res-end-date').value;
        const start_time = document.getElementById('input-res-start').value;
        const end_time = document.getElementById('input-res-end').value;
        const reason = document.getElementById('input-res-reason').value.trim();
        const is_displacement = document.getElementById('input-res-displacement')?.checked ? 1 : 0;

        if (!start_date || !start_time || !end_time || !reason) return showToast('Todos los campos son obligatorios', 'error');

        // Collect attendees
        const attendees = Array.from(document.querySelectorAll('#attendees-list .attendee-input'))
            .map(i => i.value.trim()).filter(Boolean);

        if (!start_date || !end_date) return showToast('Las fechas son obligatorias', 'error');
        if (new Date(start_date) > new Date(end_date)) return showToast('Fecha fin no puede ser menor a fecha inicio', 'error');

        let result;
        if (this.currentReservationId) {
            result = await API.put(`/reservations/${this.currentReservationId}`, { start_date, end_date, start_time, end_time, reason, is_displacement, attendees: JSON.stringify(attendees) });
        } else {
            result = await API.post('/reservations', { start_date, end_date, start_time, end_time, reason, is_displacement, attendees: JSON.stringify(attendees) });
        }
        
        if (result.error) {
            if (result.error.includes('Conflicto')) {
                const errDiv = document.getElementById('reservation-error');
                errDiv.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' + result.error;
                errDiv.style.display = 'block';
                return;
            }
            return showToast(result.error, 'error');
        }

        showToast('Reserva guardada', 'success');
        this.closeAll();
        Calendar.render();
    },

    // ===== MEETING REQUESTS (Admin) =====

    _currentMeetingRequestId: null,

    async openMeetingRequestsList() {
        // Load all pending requests and show first one, or show a list
        const requests = await API.get('/meeting-requests?status=pending');
        if (!requests || !requests.length) {
            showToast('No hay solicitudes de reunión pendientes', 'info');
            return;
        }
        // Open first pending
        this.openMeetingRequestDetail(requests[0]);
    },

    openMeetingRequestDetail(req) {
        this._currentMeetingRequestId = req.id;
        document.getElementById('mr-requester-name').textContent = req.requester_name || '—';
        document.getElementById('mr-requester-contact').textContent = req.requester_contact || 'Sin contacto';
        const dateFormatted = req.requested_date ? new Date(req.requested_date + 'T00:00:00').toLocaleDateString('es-BO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—';
        document.getElementById('mr-date').textContent = dateFormatted;
        document.getElementById('mr-time').textContent = `${req.start_time?.substring(0,5)} — ${req.end_time?.substring(0,5)}`;
        document.getElementById('mr-reason').textContent = req.reason || 'Sin motivo especificado';
        document.getElementById('mr-admin-notes').value = '';
        this.open('modal-meeting-request');
    },

    async reviewMeetingRequest(status) {
        if (!this._currentMeetingRequestId) return;
        const notes = document.getElementById('mr-admin-notes').value.trim();
        const result = await API.put(`/meeting-requests/${this._currentMeetingRequestId}`, { status, admin_notes: notes });
        if (result.error) return showToast(result.error, 'error');
        
        const msg = status === 'approved' ? 'Solicitud aprobada — se creó la reserva' : 'Solicitud rechazada';
        showToast(msg, status === 'approved' ? 'success' : 'warning');
        this.closeAll();
        Calendar.render();
        // Refresh badge
        if (typeof Calendar.loadMeetingRequestsBadge === 'function') Calendar.loadMeetingRequestsBadge();
    },

    // ===== CLOSE WEEK =====

    openCloseWeek() {
        // Default to next Monday
        const now = new Date();
        const day = now.getDay();
        const diff = day === 0 ? 1 : (8 - day);
        const nextMon = new Date(now);
        nextMon.setDate(now.getDate() + diff);
        document.getElementById('input-close-week-date').value = nextMon.toISOString().split('T')[0];
        document.getElementById('input-close-week-reason').value = 'Estudio cerrado';
        this.open('modal-close-week');
        this.initDatePickers('modal-close-week');
    },

    async doCloseWeek() {
        const week_start = document.getElementById('input-close-week-date').value;
        const reason = document.getElementById('input-close-week-reason').value.trim();
        if (!week_start) return showToast('Selecciona la fecha', 'error');

        const result = await API.post('/closed-weeks', { week_start, reason });
        if (result.error) return showToast(result.error, 'error');

        showToast('Semana cerrada', 'success');
        this.closeAll();
        Calendar.render();
    },

    // ===== ASSIGNMENT DETAIL =====

    async showAssignmentDetail(assignmentId) {
        this.currentAssignmentId = assignmentId;
        const data = await API.get(`/assignments/${assignmentId}`);
        if (data.error) return showToast(data.error, 'error');

        const canEdit = App.user && ['admin', 'post_productor'].includes(App.user.role);

        document.getElementById('detail-title').textContent = `${data.subject_code} — ${data.subject_name}`;

        const scriptClass = `script-${data.script_status}`;
        const scriptText = SCRIPT_LABELS[data.script_status] || data.script_status;

        let html = `<div class="detail-grid">
            <div class="detail-field">
                <div class="detail-field-label">Docente</div>
                <div class="detail-field-value">${data.teacher_name}</div>
            </div>
            <div class="detail-field">
                <div class="detail-field-label">Teléfono</div>
                <div class="detail-field-value">${data.phone || '—'}</div>
            </div>
            <div class="detail-field">
                <div class="detail-field-label">Sede / Ciudad</div>
                <div class="detail-field-value">
                    ${canEdit ? `
                        <select class="input select" style="font-size:12px;padding:2px 8px;height:28px;width:100%;" onchange="Modals.updateAssignmentField('sede', this.value)">
                            <option value="La Paz" ${data.sede === 'La Paz' ? 'selected' : ''}>La Paz</option>
                            <option value="El Alto" ${data.sede === 'El Alto' ? 'selected' : ''}>El Alto</option>
                            <option value="Cochabamba" ${data.sede === 'Cochabamba' ? 'selected' : ''}>Cochabamba</option>
                            <option value="Santa Cruz" ${data.sede === 'Santa Cruz' ? 'selected' : ''}>Santa Cruz</option>
                            <option value="Sucre" ${data.sede === 'Sucre' ? 'selected' : ''}>Sucre</option>
                            <option value="Oruro" ${data.sede === 'Oruro' ? 'selected' : ''}>Oruro</option>
                            <option value="Potosí" ${data.sede === 'Potosí' ? 'selected' : ''}>Potosí</option>
                            <option value="Tarija" ${data.sede === 'Tarija' ? 'selected' : ''}>Tarija</option>
                            <option value="Trinidad" ${data.sede === 'Trinidad' ? 'selected' : ''}>Trinidad</option>
                            <option value="Cobija" ${data.sede === 'Cobija' ? 'selected' : ''}>Cobija</option>
                        </select>
                    ` : (data.sede || 'La Paz')}
                </div>
            </div>
            <div class="detail-field" style="${(data.sede && !['la paz', 'el alto'].includes(data.sede.trim().toLowerCase())) ? '' : 'display:none;'}">
                <div class="detail-field-label">Pasaje de Vuelo</div>
                <div class="detail-field-value">${data.flight_ticket_path ? `<a href="/api${data.flight_ticket_path}" target="_blank" class="btn-sm btn-outline">📄 Ver PDF</a>` : '<span style="color:var(--text-muted)">No subido</span>'}</div>
            </div>

        <div class="detail-field">
                <div class="detail-field-label">Link del Guión</div>
                <div class="detail-field-value">${data.drive_link ? `<a href="${data.drive_link}" target="_blank">Abrir en Drive ↗</a>` : '—'}</div>
            </div>
            <div class="detail-field">
                <div class="detail-field-label">Estado</div>
                <div class="detail-field-value">${data.status === 'completed' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Completada' : data.status === 'cancelled' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Cancelada' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> En progreso'}</div>
            </div>
        </div>`;
        // Whatsapp Templates Dropdown (admin/post only)
        const cleanPhone = data.phone ? data.phone.replace(/[^0-9]/g, '') : '';
        const safeTeacherName = (data.teacher_name || '').replace(/'/g, "\\'");
        const safeSubject = (data.subject_name || '').replace(/'/g, "\\'");
        const safeSede = (data.sede || 'La Paz');
        Modals._currentWhatsAppContext = data; // Store context for the template generator
        const whatsappHtml = (canEdit && cleanPhone) ? `
        <div class="divider"></div>
        <div style="margin-top:16px;">
            <label style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">Plantillas WhatsApp</label>
            <div style="display:flex;gap:8px;">
                <select class="input select" id="wa-template-select" style="flex:1;max-width:100%;">
                    <option value="">-- Seleccionar Plantilla --</option>
                    <option value="coordinacion">Coordinación de Fechas</option>
                    <option value="confirmacion">Confirmación de Reserva</option>
                    <option value="recordatorio">Recordatorio de Filmación</option>
                    <option value="reagendamiento">Sesión Re-agendada</option>
                    <option value="esperando">Esperando en Estudio</option>
                    <option value="protocolo">Protocolo de Vestuario</option>
                </select>
                <button class="btn-sm btn-success" onclick="Modals.sendWhatsappTemplate('${cleanPhone}', '${safeTeacherName}', '${safeSubject}', '${safeSede}')" style="display:inline-flex; align-items:center; gap:4px; height: 32px; padding: 0 16px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                    Enviar
                </button>
            </div>
        </div>` : '';

        // Edit section — editable for admin/post, read-only for academica
        if (canEdit) {
            html += `<div class="divider"></div>
            <div style="margin-top:16px;">
                <label style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">Staff</label>
                <div style="display:flex;flex-direction:column;gap:6px;">`;
            
            if (data.sessions && data.sessions.length > 0) {
                const sessionsWithStaff = data.sessions.filter(s => s.staff_1_name || s.staff_2_name || s.staff_3_name || s.staff_4_name);
                if (sessionsWithStaff.length === 0) {
                    html += `<span style="font-size:12px;color:var(--text-muted);font-style:italic;">Sin staff asignado aún. Edita cada sesión para asignar.</span>`;
                } else {
                    for (const s of sessionsWithStaff) {
                        const dp = s.session_date.split('-');
                        const dateF = `${dp[2]}/${dp[1]}/${dp[0]}`;
                        const startH = parseInt((s.start_time||'08:00').substring(0,2), 10);
                        const endH = parseInt((s.end_time||'10:00').substring(0,2), 10);
                        const isFullDay = startH < 13 && endH > 13;
                        
                        let staffHtml = `<div style="background:var(--bg-tertiary);border-radius:6px;padding:6px 10px;font-size:12px;">
                            <span style="color:var(--text-muted);font-size:10px;font-weight:700;text-transform:uppercase;">${dateF}</span><br>`;
                        
                        if (isFullDay) {
                            if (s.staff_1_name || s.staff_2_name) {
                                staffHtml += `<span style="color:var(--cyan);font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:3px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v8"/><path d="M4.93 10.93l1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="M19.07 10.93l-1.41 1.41"/><path d="M22 22H2"/><path d="M8 6l4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg> Mañana: </span><span style="color:var(--text-primary);">${[s.staff_1_name, s.staff_2_name].filter(Boolean).join(', ')}</span><br>`;
                            }
                            if (s.staff_3_name || s.staff_4_name) {
                                staffHtml += `<span style="color:var(--amber);font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:3px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 18a5 5 0 0 0-10 0"></path><line x1="12" y1="2" x2="12" y2="9"></line><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"></line><line x1="1" y1="18" x2="3" y2="18"></line><line x1="21" y1="18" x2="23" y2="18"></line><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"></line><line x1="23" y1="22" x2="1" y2="22"></line><polyline points="8 6 12 2 16 6"></polyline></svg> Tarde: </span><span style="color:var(--text-primary);">${[s.staff_3_name, s.staff_4_name].filter(Boolean).join(', ')}</span>`;
                            }
                        } else {
                            staffHtml += `<span style="color:var(--text-primary);">${[s.staff_1_name, s.staff_2_name].filter(Boolean).join(', ')}</span>`;
                        }
                        staffHtml += `</div>`;
                        html += staffHtml;
                    }
                }
            } else {
                html += `<span style="font-size:12px;color:var(--text-muted);font-style:italic;">Sin sesiones registradas.</span>`;
            }
            
            html += `</div></div>`;
            html += `<div class="divider"></div>
            <div style="margin-top:16px;">
                <label style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">Bitácora</label>
                <textarea id="assignment-bitacora" class="input" rows="4" placeholder="Escribe aquí lo que se grabó, notas, incidencias..." style="width:100%;max-width:100%;resize:vertical;font-size:13px;line-height:1.5;" oninput="Modals._debounceSaveBitacora(this.value)" onblur="Modals.saveBitacora(this.value)">${data.bitacora || ''}</textarea>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
                    <span id="bitacora-save-status" style="font-size:11px;color:var(--text-muted);">Se guarda automáticamente.</span>
                    <button class="btn-sm btn-outline" onclick="Modals.saveBitacora(document.getElementById('assignment-bitacora').value, true)" style="font-size:11px;padding:2px 12px;height:24px;">Guardar manual</button>
                </div>
            </div>
            ${whatsappHtml}`;
        }

        // Sessions list
        html += `<div class="divider"></div>
        <div class="detail-sessions-title">Sesiones de Grabación (${data.sessions?.length || 0})</div>`;

        if (data.sessions && data.sessions.length > 0) {
            html += `<div class="detail-sessions-grid">`;
            for (const s of data.sessions) {
                const hitoClass = s.hito_reached ? `hito-${s.hito_reached}` : '';
                const hitoText = s.hito_reached ? HITO_LABELS[s.hito_reached] : '';
                const dateParts = s.session_date.split('-');
                const dateF = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                const isSessCancelled = s.status === 'cancelled';
                const cancelledStyle = isSessCancelled ? 'opacity:0.65; border: 1px dashed rgba(239,68,68,0.5); background: rgba(239,68,68,0.04);' : '';
                const cancelledBanner = isSessCancelled ? `<div style="background:rgba(239,68,68,0.12);color:#ef4444;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;margin-bottom:4px;display:flex;align-items:center;gap:4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>SESIÓN CANCELADA — Docente no se presentó</div>` : '';
                html += `<div class="detail-session" style="${cancelledStyle}">
                    ${cancelledBanner}
                    <div class="detail-session-header">
                        <span class="detail-session-date" style="${isSessCancelled ? 'text-decoration:line-through;opacity:0.7;' : ''}">${dateF}</span>
                        <div class="detail-session-actions">
                            ${App.user && ['admin','post_productor'].includes(App.user.role) ? `
                            ${!isSessCancelled ? `<button class="btn-icon" onclick="Modals.openEditSession(${s.id}, '${s.session_date}', '${s.start_time?.substring(0,5)}', '${s.end_time?.substring(0,5)}', '${s.hito_reached||''}', \`${(s.notes||'').replace(/\`/g,"'").replace(/"/g,'&quot;')}\`, '${s.staff_1_id||''}', '${s.staff_2_id||''}', '${s.staff_3_id||''}', '${s.staff_4_id||''}')" title="Editar sesión" style="color:var(--accent);">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                            </button>` : ''}
                            ${!isSessCancelled ? `<button class="btn-icon" onclick="Modals.cancelSession(${s.id})" title="Marcar como cancelada por inasistencia" style="color:#ef4444;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            </button>` : `<button class="btn-icon" onclick="Modals.reactivateSession(${s.id})" title="Reactivar sesión" style="color:var(--green);">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                            </button>`}
                            ` : ''}
                            <button class="btn-icon" onclick="Modals.deleteSession(${s.id})" title="Eliminar sesión">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="detail-session-time" style="${isSessCancelled ? 'opacity:0.6;' : ''}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1.5px; margin-right:3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${s.start_time?.substring(0,5)} - ${s.end_time?.substring(0,5)}
                    </div>
                    ${hitoText ? `<div style="margin-top:6px;"><span class="detail-session-hito ${hitoClass}">${hitoText}</span></div>` : ''}
                    <div class="detail-session-notes">
                        ${s.notes ? s.notes : '<span style="opacity:0.5;font-style:italic;">Sin notas</span>'}
                    </div>
                </div>`;
            }
            html += `</div>`;
        } else {
            html += '<p style="color:var(--text-muted);font-size:13px;">No hay sesiones registradas</p>';
        }

        document.getElementById('detail-body').innerHTML = html;

        // Show/hide footer action buttons based on role
        const addSessionBtn = document.getElementById('btn-detail-add-session');
        const completeBtn = document.getElementById('btn-detail-complete');
        const isCanEdit = App.user && ['admin', 'post_productor'].includes(App.user.role);

        addSessionBtn.style.display = isCanEdit ? '' : 'none';
        completeBtn.style.display = (isCanEdit && data.status === 'in_progress') ? '' : 'none';

        if (isCanEdit) {
            // Staff is now shown as a per-session summary above
        }

        this.open('modal-detail');
    },

    addAssignmentAttendeeField(value = '') {
        const list = document.getElementById('assignment-attendees-list');
        if (!list) return;
        const max = 4;
        if (list.children.length >= max) {
            showToast(`Máximo ${max} personas`, 'info');
            return;
        }
        const staff = Array.isArray(Modals._postUsers) ? Modals._postUsers : [];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;';

        const select = document.createElement('select');
        select.className = 'input select assignment-attendee-input';
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
            // Value not in list (might be legacy or external)
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            opt.selected = true;
            select.appendChild(opt);
        }

        select.onchange = () => document.getElementById('btn-save-assignment-attendees').style.display = 'inline-flex';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.title = 'Quitar';
        removeBtn.style.cssText = 'width:28px;height:28px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--red);cursor:pointer;font-size:16px;line-height:1;';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => {
            row.remove();
            document.getElementById('btn-save-assignment-attendees').style.display = 'inline-flex';
        };

        row.appendChild(select);
        row.appendChild(removeBtn);
        list.appendChild(row);
        document.getElementById('btn-save-assignment-attendees').style.display = 'inline-flex';
    },

    async saveAssignmentAttendees() {
        if (!this.currentAssignmentId) return;
        const inputs = document.querySelectorAll('.assignment-attendee-input');
        const attendees = [];
        inputs.forEach(i => { if (i.value) attendees.push(i.value); });
        
        const result = await API.put(`/assignments/${this.currentAssignmentId}`, { assigned_staff: attendees.join(', ') });
        if (result && result.error) {
            return showToast('Error al guardar: ' + result.error, 'error');
        }
        
        showToast('Personal asignado guardado', 'success');
        const saveBtn = document.getElementById('btn-save-assignment-attendees');
        if (saveBtn) saveBtn.style.display = 'none';
        
        // Update local context to avoid re-showing the save button on re-render
        Modals._currentAssignmentStaff = attendees;
        Calendar.render();
    },

    _bitacoraDebounceTimer: null,
    _lastSavedBitacora: null,

    _debounceSaveBitacora(value) {
        clearTimeout(this._bitacoraDebounceTimer);
        const status = document.getElementById('bitacora-save-status');
        if (status) { status.textContent = 'Sin guardar...'; status.style.color = 'var(--amber)'; }
        this._bitacoraDebounceTimer = setTimeout(() => this.saveBitacora(value), 2000);
    },

    async saveBitacora(value, manual = false) {
        if (!this.currentAssignmentId) return;
        // Evitar guardados duplicados con el mismo valor
        if (!manual && value === this._lastSavedBitacora) return;
        clearTimeout(this._bitacoraDebounceTimer);
        try {
            const result = await API.put(`/assignments/${this.currentAssignmentId}`, { bitacora: value });
            if (result && result.error) {
                const status = document.getElementById('bitacora-save-status');
                if (status) { status.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Error al guardar'; status.style.color = 'var(--red)'; }
                return showToast('Error al guardar bitácora: ' + result.error, 'error');
            }
            this._lastSavedBitacora = value;
            const status = document.getElementById('bitacora-save-status');
            if (status) { status.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><polyline points="20 6 9 17 4 12"></polyline></svg> Guardado'; status.style.color = 'var(--green)'; }
            if (manual) showToast('Bitácora guardada', 'success');
        } catch (e) {
            const status = document.getElementById('bitacora-save-status');
            if (status) { status.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Error de conexión'; status.style.color = 'var(--red)'; }
            showToast('Error al guardar bitácora — revisa tu conexión', 'error');
        }
    },

    async updateAssignmentField(field, value) {
        if (!this.currentAssignmentId) return;
        await API.put(`/assignments/${this.currentAssignmentId}`, { [field]: value });
        showToast('Actualizado', 'success');
        // Refresh detail without closing
        this.showAssignmentDetail(this.currentAssignmentId);
        Calendar.render();
        Dashboard.refresh();
    },

    async deleteSession(sessionId) {
        Calendar.showConfirm({
            title: 'Eliminar Sesión',
            message: '¿Eliminar esta sesión de grabación?'
        }, async () => {
            await API.del(`/sessions/${sessionId}`);
            showToast('Sesión eliminada', 'success');
            this.showAssignmentDetail(this.currentAssignmentId);
            Calendar.render();
        });
    },

    // ===== CANCEL / REACTIVATE SESSION =====

    async cancelSession(sessionId) {
        Calendar.showConfirm({
            title: '¿Cancelar sesión por inasistencia?',
            message: 'El docente no se presentó. Esta acción quedará registrada automáticamente en la bitácora.',
            okLabel: 'Cancelar sesión',
            danger: true
        }, async () => {
            const result = await API.put(`/sessions/${sessionId}`, { status: 'cancelled' });
            if (result && result.error) return showToast(result.error, 'error');
            showToast('Sesión marcada como cancelada', 'warning');
            this.showAssignmentDetail(this.currentAssignmentId);
            Calendar.render();
        });
    },

    async reactivateSession(sessionId) {
        Calendar.showConfirm({
            title: 'Reactivar sesión',
            message: '¿Deseas reactivar esta sesión y marcarla como programada nuevamente?',
            okLabel: 'Reactivar'
        }, async () => {
            const result = await API.put(`/sessions/${sessionId}`, { status: 'scheduled' });
            if (result && result.error) return showToast(result.error, 'error');
            showToast('Sesión reactivada', 'success');
            this.showAssignmentDetail(this.currentAssignmentId);
            Calendar.render();
        });
    },

    // ===== EDIT SESSION =====

    _editingSessionId: null,

    async openEditSession(id, date, start, end, hito, notes, staff1Id, staff2Id, staff3Id, staff4Id) {
        this._editingSessionId = id;
        
        ['input-edit-session-start', 'input-edit-session-end'].forEach(id => this.convertToTimeSelect(id));
        
        document.getElementById('input-edit-session-date').value = date || '';
        document.getElementById('input-edit-session-start').value = start || '08:00';
        document.getElementById('input-edit-session-end').value = end || '10:00';
        document.getElementById('input-edit-session-notes').value = notes || '';
        
        // Load staff into all dropdowns
        const s1 = document.getElementById('input-edit-session-staff-1');
        const s2 = document.getElementById('input-edit-session-staff-2');
        const s3 = document.getElementById('input-edit-session-staff-3');
        const s4 = document.getElementById('input-edit-session-staff-4');
        const staff = await API.get('/staff');
        const optDefault = '<option value="">-- Sin asignar --</option>';
        [s1, s2, s3, s4].forEach(sel => { sel.innerHTML = optDefault; });
        if (Array.isArray(staff)) {
            staff.forEach(u => {
                const opt = `<option value="${u.id}">${u.name || u.username}</option>`;
                [s1, s2, s3, s4].forEach(sel => { sel.innerHTML += opt; });
            });
        }
        s1.value = staff1Id || '';
        s2.value = staff2Id || '';
        s3.value = staff3Id || '';
        s4.value = staff4Id || '';

        // Detect full day: start before 13:00 AND end after 13:00
        const startH = parseInt((start || '08:00').split(':')[0], 10);
        const endH = parseInt((end || '10:00').split(':')[0], 10);
        const isFullDay = startH < 13 && endH > 13;
        
        const morningLabel = document.getElementById('edit-staff-morning-label');
        const afternoonBlock = document.getElementById('edit-staff-afternoon-block');
        if (isFullDay) {
            morningLabel.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><path d="M12 2v8"/><path d="M4.93 10.93l1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="M19.07 10.93l-1.41 1.41"/><path d="M22 22H2"/><path d="M8 6l4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg> Mañana';
            morningLabel.style.color = 'var(--cyan)';
            afternoonBlock.style.display = 'block';
        } else {
            morningLabel.textContent = 'Staff';
            morningLabel.style.color = 'var(--text-muted)';
            afternoonBlock.style.display = 'none';
        }

        // Close detail and open edit session modal
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        this.open('modal-edit-session');
        this.initDatePickers('modal-edit-session');
    },

    async saveEditSession() {
        if (!this._editingSessionId) return;
        const session_date = document.getElementById('input-edit-session-date').value;
        const start_time   = document.getElementById('input-edit-session-start').value;
        const end_time     = document.getElementById('input-edit-session-end').value;
        const notes        = document.getElementById('input-edit-session-notes').value.trim();

        const staff_1_id = document.getElementById('input-edit-session-staff-1').value || null;
        const staff_2_id = document.getElementById('input-edit-session-staff-2').value || null;
        const staff_3_id = document.getElementById('input-edit-session-staff-3').value || null;
        const staff_4_id = document.getElementById('input-edit-session-staff-4').value || null;

        if (!session_date || !start_time || !end_time) return showToast('Completa fecha y horario', 'error');

        const result = await API.put(`/sessions/${this._editingSessionId}`, { session_date, start_time, end_time, notes, staff_1_id, staff_2_id, staff_3_id, staff_4_id });
        if (result.error) return showToast(result.error, 'error');

        showToast('Sesión actualizada', 'success');
        this.closeAll();
        Calendar.render();
        this.showAssignmentDetail(this.currentAssignmentId);
    },

    sendWhatsappTemplate(phone, teacherName, subject, sede) {
        const select = document.getElementById('wa-template-select');
        const templateId = select.value;
        if (!templateId) return showToast('Selecciona una plantilla', 'error');

        // === GENDER DETECTION (global) ===
        const inferGender = (name) => {
            if (!name) return 'm';
            const first = name.trim().split(' ')[0].toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const maleNames = ['jose','rene','noel','israel','josue','moises','elias','isaias','nehemias',
                'jeremias','jonas','nicolas','tomas','matias','tobias','garcia','mejia','garcia','peña',
                'borja','costa','soria','sosa','rocha','ochoa','poma','lima','aranda','espinoza',
                'carlos','juan','pedro','luis','mario','diego','jorge','andres','marco','pablo',
                'sergio','fernando','oscar','hugo','victor','ricardo','eduardo','roberto','raul',
                'gustavo','miguel','angel','daniel','david','ivan','franklin','freddy','franz',
                'gonzalo','alvaro','rodrigo','mauricio','patricio','fabian','adrian','christian',
                'erick','vladimir','rolando','orlando','armando','leonardo','bernardo','gerardo',
                'alfredo','wilfredo','wilmer','ever','iver','limber','grover','percy','willy','walter'];
            const femaleNames = ['carmen','isabel','luz','paz','sol','ruth','noemi','nohemi','judith',
                'miriam','liz','mar','mercedes','dolores','pilar','rosario','consuelo','socorro',
                'flor','beatriz','ingrid','margot','marisol','gladys','wendy','shirley','jenny',
                'nancy','elizabeth','evelyn','abigail','raquel','esther','ester','araceli',
                'maria','ana','laura','andrea','patricia','claudia','silvia','sandra','rosa',
                'carla','paola','gabriela','veronica','monica','marcela','cecilia','viviana',
                'adriana','carolina','diana','elena','irene','lorena','susana','teresa','ximena',
                'yolanda','zoila','nelly','betty','edith','karen','magaly','tatiana','vanesa'];
            if (maleNames.includes(first)) return 'm';
            if (femaleNames.includes(first)) return 'f';
            if (first.endsWith('a') || first.endsWith('is')) return 'f';
            return 'm';
        };

        const teacherGender = inferGender(teacherName);
        const myGender = inferGender((App.user && App.user.name) ? App.user.name : '');
        const lox = teacherGender === 'f' ? 'la' : 'lo';
        const estimadx = teacherGender === 'f' ? 'Estimada' : 'Estimado';

        // Saludo según hora
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'buenos días' : 'buenas tardes';

        // Nombre del usuario actual
        let myName = (App.user && App.user.name) ? App.user.name.split(' ')[0] : 'parte del equipo';
        if (myName.toLowerCase() === 'israx') myName = 'Israel';
        const firstName = teacherName.split(' ')[0];

        // === FORMATEAR SESIONES (solo futuras) ===
        let sessionText = '';
        let hasFutureSessions = false;
        if (Modals._currentWhatsAppContext && Modals._currentWhatsAppContext.sessions && Modals._currentWhatsAppContext.sessions.length > 0) {
            const now = new Date().toISOString().split('T')[0];
            let sessions = Modals._currentWhatsAppContext.sessions.filter(s => s.session_date >= now && s.status !== 'cancelled');
            hasFutureSessions = sessions.length > 0;

            if (hasFutureSessions) {
                const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

                const formatted = sessions.map(s => {
                    const d = new Date(s.session_date + 'T12:00:00');
                    const dia = dias[d.getDay()];
                    const num = String(d.getDate()).padStart(2, '0');
                    const mes = meses[d.getMonth()];
                    const h1 = s.start_time ? parseInt(s.start_time.split(':')[0]) : 12;
                    const turno = h1 < 13 ? 'mañana' : 'tarde';
                    const t1 = s.start_time?.substring(0,5) || '';
                    const t2 = s.end_time?.substring(0,5) || '';
                    return `${dia} ${num} ${mes} (${turno}, ${t1} a ${t2})`;
                });

                if (formatted.length === 1) {
                    sessionText = `el *${formatted[0]}*`;
                } else {
                    sessionText = `los siguientes días:\n${formatted.map(s => `• ${s}`).join('\n')}`;
                }
            }
        }

        // === CONSTRUIR MENSAJE ===
        const isLocal = sede.trim().toLowerCase() === 'la paz';
        const estudioText = isLocal ? 'el estudio' : 'el estudio en La Paz';

        let message = '';
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

        const saludo = pick([
            `Hola ${firstName}, ${greeting}.`,
            `${estimadx} ${firstName}, ${greeting}.`,
            `Hola ${firstName}, ${greeting}!`
        ]);

        const firma = `\n\n${myName}\n_Estudio de Filmación EDTECH_`;

        if (templateId === 'coordinacion') {
            message = pick([
                `${saludo}\n\nLe escribo desde el *Estudio de Filmación EDTECH*.\n\nQueremos coordinar las fechas de grabación de la materia *${subject}*. ¿Qué días le vendrían bien?`,
                `${saludo}\n\nSoy ${myName} del *Estudio EDTECH*.\n\nNecesitamos agendar la filmación de *${subject}*. ¿Podría indicarnos su disponibilidad?`,
                `${saludo}\n\nLe contacto del *Estudio EDTECH* para coordinar la grabación de *${subject}*.\n\n¿Cuándo tendría disponibilidad? Nos adaptamos a su agenda.`
            ]);
            message += firma;
        } else if (templateId === 'confirmacion') {
            const fechaBlock = sessionText ? `\n\n*Fecha:* ${sessionText}` : '';
            message = pick([
                `${saludo}\n\nLe confirmo su grabación de *${subject}* en ${estudioText}.${fechaBlock}\n\n¡${lox.charAt(0).toUpperCase() + lox.slice(1)} esperamos!`,
                `${saludo}\n\nQueda confirmada su filmación de *${subject}*.${fechaBlock}\n\nCualquier duda, escríbanos con confianza.`,
                `${saludo}\n\nSu sesión de *${subject}* está confirmada.${fechaBlock}\n\n¡Será un gusto recibirle!`
            ]);
            message += firma;
        } else if (templateId === 'recordatorio') {
            const fechaBlock = sessionText ? `\n\n${sessionText}` : '';
            message = pick([
                `${saludo}\n\nRecordatorio: tiene grabación de *${subject}* en ${estudioText}.${fechaBlock}\n\n¡${lox.charAt(0).toUpperCase() + lox.slice(1)} esperamos!`,
                `${saludo}\n\nLe recordamos su sesión de filmación de *${subject}*.${fechaBlock}\n\n¡Todo listo para recibirle!`,
                `${saludo}\n\nSolo un recordatorio de su grabación de *${subject}*.${fechaBlock}\n\n¡Nos vemos pronto!`
            ]);
            message += firma;
        } else if (templateId === 'reagendamiento') {
            const fechaBlock = sessionText ? `\n\n*Nueva fecha:* ${sessionText}` : '\n\n_Le confirmaremos la nueva fecha a la brevedad._';
            message = pick([
                `${saludo}\n\nLe informo que su sesión de *${subject}* fue *re-agendada*.${fechaBlock}\n\nDisculpe las molestias y gracias por su comprensión.`,
                `${saludo}\n\nHubo un cambio en la agenda de *${subject}*.${fechaBlock}\n\nLamentamos el inconveniente. ¡Quedamos atentos!`,
                `${saludo}\n\nSu grabación de *${subject}* cambió de fecha.${fechaBlock}\n\nGracias por su flexibilidad.`
            ]);
            message += firma;
        } else if (templateId === 'esperando') {
            message = pick([
                `${saludo}\n\nSoy ${myName}, ya estamos listos en ${estudioText} para su grabación de *${subject}*.\n\n¡${lox.charAt(0).toUpperCase() + lox.slice(1)} esperamos!`,
                `${saludo}\n\nTodo listo en ${estudioText} para filmar *${subject}*. ¡${lox.charAt(0).toUpperCase() + lox.slice(1)} esperamos cuando pueda llegar!`,
                `${saludo}\n\nEl equipo ya está preparado en ${estudioText} para *${subject}*. ¡Venga con confianza!`
            ]);
            message += `\n\n${myName}\n_Estudio EDTECH_`;
        } else if (templateId === 'protocolo') {
            message = pick([
                `${saludo}\n\nLe comparto el *Protocolo de Vestuario* para la filmación de *${subject}*.\n\nRecuerde traer *5 mudas de ropa* (una por hito). En el PDF encontrará qué colores usar y qué evitar.\n\nRevise la guía completa aquí:`,
                `${saludo}\n\nPara su grabación de *${subject}*, necesitará *5 cambios de ropa* (uno por cada hito).\n\nEn el documento adjunto verá las recomendaciones de vestuario y colores ideales para cámara.\n\nGuía completa:`,
                `${saludo}\n\nAntes de su filmación de *${subject}*, le recuerdo traer *5 mudas de vestuario* distintas.\n\nEsto nos ayuda a dar variedad visual. Más detalles en el PDF:`
            ]);
            message += firma;
        }

        // === BLOQUES ADICIONALES ===

        if (['confirmacion', 'recordatorio', 'reagendamiento', 'esperando'].includes(templateId)) {
            message += `\n\n*UBICACIÓN DEL ESTUDIO*`;
            message += `\nEdificio Iturri, piso 18`;
            message += `\nAv. 6 de Agosto esq. Campos`;
            message += `\nSopocachi, La Paz`;
            message += `\n\nhttps://maps.google.com/?q=Edificio+Iturri+La+Paz`;
            message += `\n\n_Entrada por calle Campos. Pida al portero que active el ascensor._`;
        }

        if (['coordinacion', 'confirmacion', 'recordatorio', 'reagendamiento', 'protocolo'].includes(templateId)) {
            message += `\n\n*Guía de Protocolo:*`;
            message += `\nhttps://edtech-studio.page.gd/docs/Guia-Protocolo_V4.pdf`;
        }

        let finalPhone = phone;
        if (finalPhone.length === 8) {
            finalPhone = '591' + finalPhone;
        }

        let encoded = encodeURIComponent(message);
        const url = `https://wa.me/${finalPhone}?text=${encoded}`;
        window.open(url, '_blank');
        
        if (templateId === 'coordinacion' || templateId === 'confirmacion') {
            this.updateAssignmentField('status', 'in_progress'); 
        }
    },

    async markComplete() {
        if (!this.currentAssignmentId) return;
        Calendar.showConfirm({
            title: 'Completar Filmación',
            message: '¿Marcar esta filmación como completada?',
            okLabel: 'Completar'
        }, async () => {
            await API.put(`/assignments/${this.currentAssignmentId}`, { status: 'completed' });
            showToast('Filmación marcada como completada', 'success');
            this.closeAll();
            Calendar.render();
            Dashboard.refresh();
            if (App.currentView === 'goals') Goals.refresh();
        });
    },

    // ===== ADD SESSION (to existing) =====

    // ── Availability calendar state ─────────────────────────────
    _availYear: null,
    _availMonth: null,
    _availData: {},

    async openAddSession() {
        if (!this.currentAssignmentId) return;

        // Pre-fill context title
        const title = document.getElementById('detail-title').textContent;
        document.getElementById('session-context').innerHTML = `<div class="session-context-teacher">${title}</div>`;

        // Reset fields
        document.getElementById('input-new-session-date').value = '';
        ['input-new-session-start', 'input-new-session-end'].forEach(id => this.convertToTimeSelect(id));
        document.getElementById('avail-selected-display').style.display = 'none';
        document.getElementById('avail-selected-display').textContent = '';
        const hitoEl = document.getElementById('input-new-session-hito');
        if (hitoEl) hitoEl.value = '';
        const notesEl = document.getElementById('input-new-session-notes');
        if (notesEl) notesEl.value = '';
        const errDiv = document.getElementById('add-session-error');
        if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; }

        // Set current month
        const now = new Date();
        this._availYear = now.getFullYear();
        this._availMonth = now.getMonth() + 1;

        const assignmentId = this.currentAssignmentId;
        this.closeAll();
        this.currentAssignmentId = assignmentId;
        this.open('modal-add-session');
        this.initDatePickers('modal-add-session');

        await this._renderAvailCalendar();
    },

    availCalPrev() {
        this._availMonth--;
        if (this._availMonth < 1) { this._availMonth = 12; this._availYear--; }
        this._renderAvailCalendar();
    },

    availCalNext() {
        this._availMonth++;
        if (this._availMonth > 12) { this._availMonth = 1; this._availYear++; }
        this._renderAvailCalendar();
    },

    async _renderAvailCalendar() {
        const y = this._availYear;
        const m = this._availMonth;

        // Update title
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        document.getElementById('avail-cal-title').textContent = `${monthNames[m - 1]} ${y}`;

        // Fetch availability
        const data = await API.get(`/sessions/availability?year=${y}&month=${m}`);
        this._availData = data || {};

        const grid = document.getElementById('avail-cal-grid');
        grid.innerHTML = '';

        // Day headers
        ['L','M','X','J','V','S','D'].forEach(d => {
            const el = document.createElement('div');
            el.style.cssText = 'font-size:10px;font-weight:700;color:var(--text-muted);padding:4px 0;';
            el.textContent = d;
            grid.appendChild(el);
        });

        // First day of month (0=Sun … 6=Sat → shift to Mon-first)
        const firstDay = new Date(y, m - 1, 1).getDay(); // 0=Sun
        const offset = firstDay === 0 ? 6 : firstDay - 1;
        for (let i = 0; i < offset; i++) {
            grid.appendChild(document.createElement('div'));
        }

        const daysInMonth = new Date(y, m, 0).getDate();
        const today = new Date().toISOString().split('T')[0];
        const selectedDate = document.getElementById('input-new-session-date').value;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const status = this._availData[dateStr] || 'free';
            const isPast = dateStr < today;
            const isSelected = dateStr === selectedDate;

            const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            
            const monthDay = dateStr.substring(5);
            const holidayName = (typeof Calendar !== 'undefined' && Calendar.HOLIDAYS)
                ? (Calendar.HOLIDAYS[dateStr] || Calendar.HOLIDAYS[monthDay] || null)
                : null;

            const cell = document.createElement('div');
            const pointerEvents = (isPast || isWeekend) ? 'none' : 'auto';

            cell.style.cssText = `
                border-radius: 6px;
                padding: 5px 2px;
                font-size: 12px;
                font-weight: 600;
                cursor: ${(isPast || isWeekend) ? 'default' : 'pointer'};
                opacity: ${(isPast || isWeekend) ? '0.35' : '1'};
                position: relative;
                overflow: hidden;
                pointer-events: ${pointerEvents};
                transition: transform 0.1s, box-shadow 0.1s;
                border: 2px solid ${isSelected ? '#fff' : 'transparent'};
                box-shadow: ${isSelected ? '0 0 0 2px var(--accent)' : 'none'};
            `;

            // Color background based on status
            if (isWeekend) {
                cell.style.background = 'rgba(255,255,255,0.05)';
                cell.style.color = 'var(--text-muted)';
            } else if (holidayName) {
                cell.style.background = 'rgba(245,158,11,0.2)';
                cell.style.color = 'var(--amber)';
                cell.title = holidayName;
            } else if (status === 'full') {
                cell.style.background = 'rgba(239,68,68,0.25)';
                cell.style.color = '#ef4444';
            } else if (status === 'morning_busy') {
                // Left half red, right half green
                cell.style.background = 'linear-gradient(to right, rgba(239,68,68,0.3) 50%, rgba(34,197,94,0.25) 50%)';
                cell.style.color = 'var(--text-primary)';
            } else if (status === 'afternoon_busy') {
                // Left half green, right half amber
                cell.style.background = 'linear-gradient(to right, rgba(34,197,94,0.25) 50%, rgba(245,158,11,0.3) 50%)';
                cell.style.color = 'var(--text-primary)';
            } else {
                // free
                cell.style.background = 'rgba(34,197,94,0.15)';
                cell.style.color = '#22c55e';
            }

            cell.textContent = day;

            if (!isPast) {
                cell.addEventListener('mouseenter', () => {
                    if (dateStr !== selectedDate) cell.style.transform = 'scale(1.1)';
                });
                cell.addEventListener('mouseleave', () => {
                    cell.style.transform = 'scale(1)';
                });
                cell.addEventListener('click', () => {
                    document.getElementById('input-new-session-date').value = dateStr;

                    // Format display
                    const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
                    const dObj = new Date(dateStr + 'T12:00:00');
                    const diaName = dias[dObj.getDay()];
                    let avail = '';
                    if (status === 'full') avail = ' — Día completo';
                    else if (status === 'morning_busy') avail = ' — Mañana ocupada, tarde libre';
                    else if (status === 'afternoon_busy') avail = ' — Mañana libre, tarde ocupada';
                    else avail = ' — Día libre';
                    const display = document.getElementById('avail-selected-display');
                    display.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:-2px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${diaName.charAt(0).toUpperCase() + diaName.slice(1)} ${day} de ${monthNames[m-1]} de ${y}${avail}`;
                    display.style.display = 'block';

                    if (holidayName) {
                        display.textContent += ` (Feriado: ${holidayName})`;
                        display.style.color = 'var(--amber)';
                    } else {
                        display.style.color = 'var(--text-secondary)';
                    }

                    // Re-render to highlight selection
                    this._renderAvailCalendar();
                    this.limitTimeOptions(dateStr);
                });
            }

            grid.appendChild(cell);
        }
    },


    async saveNewSession() {
        const assignment_id = this.currentAssignmentId;
        const session_date = document.getElementById('input-new-session-date').value;
        const start_time = document.getElementById('input-new-session-start').value;
        const end_time = document.getElementById('input-new-session-end').value;
        const hito_reached = document.getElementById('input-new-session-hito')?.value || null;
        const notes = document.getElementById('input-new-session-notes').value.trim();
        const staff_1_id = document.getElementById('input-new-session-staff-1')?.value || null;
        const staff_2_id = document.getElementById('input-new-session-staff-2')?.value || null;

        if (!session_date || !start_time || !end_time) return showToast('Completa fecha y horario', 'error');

        const result = await API.post('/sessions', { assignment_id, session_date, start_time, end_time, hito_reached, notes, staff_1_id, staff_2_id });
        if (result.error) {
            if (result.error.includes('Conflicto')) {
                const errDiv = document.getElementById('add-session-error');
                errDiv.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' + result.error;
                errDiv.style.display = 'block';
                return;
            }
            return showToast(result.error, 'error');
        }

        showToast('Sesión agregada', 'success');
        this.closeAll();
        Calendar.render();
        Dashboard.refresh();
        if (App.currentView === 'goals') Goals.refresh();
    }
};
