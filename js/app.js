// ================================================
// App Controller — Main application logic
// ================================================

const App = {
    currentView: 'calendar',
    activeSemester: null,
    user: null,

    async init() {
        // Check Auth
        const token = localStorage.getItem('edtech_token');
        if (token) {
            const user = await API.get('/me', true);
            if (user && !user.error) {
                this.user = user;
                this.startApp();
            } else {
                this.showLogin();
            }
        } else {
            this.showLogin();
        }

        // Bind login form
        document.getElementById('form-login').addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('login-user').value;
            const p = document.getElementById('login-pass').value;
            const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }).then(r => r.json());
            if (res.error) return showToast(res.error, 'error');
            localStorage.setItem('edtech_token', res.token);
            this.user = res.user;
            this.startApp();
        });

        // Logout
        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            await API.post('/logout');
            localStorage.removeItem('edtech_token');
            location.reload();
        });
    },

    async startApp() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-wrapper').style.display = 'block';
        
        // Quietly run migration to ensure DB is up to date (bypasses InfinityFree requirement of manual visits)
        fetch('/api/migrate.php').catch(() => {});
        
        document.getElementById('current-user-name').textContent = this.user.name;
        
        // Show role badge
        const roleBadge = document.getElementById('user-role-badge');
        if (roleBadge) {
            const roleLabels = { admin: 'Admin', post_productor: 'Post-Producción', academica: 'Académica' };
            const roleClasses = { admin: 'role-admin', post_productor: 'role-postprod', academica: 'role-academica' };
            roleBadge.textContent = roleLabels[this.user.role] || this.user.role;
            roleBadge.className = `role-badge ${roleClasses[this.user.role] || ''}`;
        }

        this.applyRolePermissions();
        this.bindNavigation();
        await this.loadActiveSemester();
        Calendar.init();
        Dashboard.refresh();
        Modals.init();
        Notifications.init();

        // Académica starts on Agenda Pendientes
        if (this.user.role === 'academica') {
            this.switchView('pending-teachers');
        }
    },

    applyRolePermissions() {
        const role = this.user.role;
        // Admin-only elements — but skip .view sections (switchView manages those)
        document.querySelectorAll('.admin-only').forEach(el => {
            if (el.classList.contains('view')) return;
            el.style.display = role === 'admin' ? '' : 'none';
        });
        // Editor elements (admin + post_productor)
        document.querySelectorAll('.editor-only').forEach(el => {
            if (el.classList.contains('view')) return;
            el.style.display = ['admin', 'post_productor'].includes(role) ? '' : 'none';
        });
        // Academica: read-only calendar + goals + agenda, no studio controls
        if (role === 'academica') {
            // Hide only admin nav
            document.querySelectorAll('.nav-btn:not([data-view="calendar"]):not([data-view="goals"]):not([data-view="pending-teachers"])').forEach(el => el.style.display = 'none');
            // Hide ALL calendar action buttons (new filmación, close week, reserve)
            document.querySelectorAll('.calendar-actions').forEach(el => el.style.display = 'none');
            // Hide dashboard cards (internal studio stats)
            const dashCards = document.getElementById('dashboard-cards');
            if (dashCards) dashCards.style.display = 'none';
            // Hide progress bar
            const progressEl = document.querySelector('.progress-section');
            if (progressEl) progressEl.style.display = 'none';
            // Hide subject management buttons (add, import, delete all) in goals
            document.querySelectorAll('#btn-add-subject, #btn-bulk-import, #btn-delete-all-subjects').forEach(el => {
                if (el) el.style.display = 'none';
            });
        }
    },

    bindNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });
    },

    switchView(view) {
        this.currentView = view;
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${view}`)?.classList.add('active');

        if (view === 'goals') Goals.refresh();
        if (view === 'pending-teachers') PendingTeachers.refresh();
        if (view === 'admin') AdminPanel.refresh();
    },

    async loadActiveSemester() {
        const semesters = await API.get('/semesters');
        if (semesters && !semesters.error) {
            this.activeSemester = semesters.find(s => s.is_active);
            this.updateSemesterBadge();
        }
    },

    updateSemesterBadge() {
        const badge = document.getElementById('semester-badge');
        if (this.activeSemester) {
            badge.textContent = `Semestre ${this.activeSemester.name}`;
            badge.style.background = 'var(--accent-bg)';
            badge.style.color = 'var(--accent)';
        } else {
            badge.textContent = 'Sin semestre activo';
            badge.style.background = 'var(--amber-bg)';
            badge.style.color = 'var(--amber)';
        }
    },

    showLogin() {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-wrapper').style.display = 'none';
    }
};


// ================================================
// API Helper
// ================================================

const API = {
    getHeaders() {
        const token = localStorage.getItem('edtech_token');
        return token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' };
    },
    async checkAuth(res, silent) {
        if (res.status === 401 && !silent) {
            localStorage.removeItem('edtech_token');
            location.reload();
        }
        return res.json();
    },
    async get(url, silent = false) {
        const res = await fetch(`/api${url}`, { headers: this.getHeaders(), cache: 'no-store' });
        return this.checkAuth(res, silent);
    },
    async post(url, data) {
        const res = await fetch(`/api${url}`, { method: 'POST', headers: this.getHeaders(), body: JSON.stringify(data) });
        return this.checkAuth(res);
    },
    async put(url, data) {
        const res = await fetch(`/api${url}`, { method: 'PUT', headers: this.getHeaders(), body: JSON.stringify(data) });
        return this.checkAuth(res);
    },
    async del(url, data = null) {
        const opts = { method: 'DELETE', headers: this.getHeaders() };
        if (data) opts.body = JSON.stringify(data);
        const res = await fetch(`/api${url}`, opts);
        return this.checkAuth(res);
    }
};

// ================================================
// Toast notifications
// ================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ================================================
// Notification System
// ================================================

const Notifications = {
    unreadCount: 0,
    notifications: [],
    pollInterval: null,
    isOpen: false,
    lastSeenId: 0,

    init() {
        // Create the notification bell in the header (before logout)
        this.createBellIcon();
        // Create the notification dropdown panel
        this.createDropdownPanel();
        // Create the top notification banner
        this.createTopBanner();

        // Request browser notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            setTimeout(() => Notification.requestPermission(), 3000); // Ask after 3s
        }

        // Start polling
        this.poll();
        this.pollInterval = setInterval(() => this.poll(), 30000); // Poll every 30s
    },

    createBellIcon() {
        const headerActions = document.querySelector('.header-actions');
        if (!headerActions) return;
        const divider = headerActions.querySelector('div[style*="border-right"]');
        if (!divider) return;

        const bellContainer = document.createElement('div');
        bellContainer.id = 'notification-bell-container';
        bellContainer.style.cssText = 'position:relative; display:flex; align-items:center;';
        bellContainer.innerHTML = `
            <button class="btn-icon" id="btn-notifications" title="Notificaciones" style="position:relative; width:32px; height:32px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <span id="notification-badge" class="notification-badge" style="display:none;">0</span>
            </button>
        `;
        divider.insertAdjacentElement('afterend', bellContainer);

        document.getElementById('btn-notifications').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !e.target.closest('#notification-bell-container') && !e.target.closest('#notification-dropdown')) {
                this.closeDropdown();
            }
        });
    },

    createDropdownPanel() {
        const panel = document.createElement('div');
        panel.id = 'notification-dropdown';
        panel.className = 'notification-dropdown';
        panel.style.display = 'none';
        panel.innerHTML = `
            <div class="notification-dropdown-header">
                <span class="notification-dropdown-title">Notificaciones</span>
                <button class="btn-sm btn-ghost" id="btn-mark-all-read" style="font-size:11px;">Marcar todo leído</button>
            </div>
            <div class="notification-dropdown-list" id="notification-list">
                <div class="notification-empty">Sin notificaciones</div>
            </div>
        `;
        const container = document.getElementById('notification-bell-container');
        if (container) container.appendChild(panel);

        document.getElementById('btn-mark-all-read').addEventListener('click', () => this.markAllRead());
    },

    createTopBanner() {
        const banner = document.createElement('div');
        banner.id = 'notification-banner';
        banner.className = 'notification-banner';
        banner.innerHTML = `
            <div class="notification-banner-content">
                <div class="notification-banner-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                </div>
                <span id="notification-banner-text"></span>
                <button class="notification-banner-close" id="notification-banner-close">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;
        document.body.prepend(banner);
        document.getElementById('notification-banner-close').addEventListener('click', () => this.hideBanner());
    },

    async poll() {
        if (!App.user) return;
        try {
            const data = await API.get('/notifications?limit=20', true);
            if (!data || data.error) return;

            this.notifications = data.notifications || [];
            this.unreadCount = data.unread_count || 0;
            this.updateBadge();

            // Show banner for NEW notifications (ones we haven't seen yet)
            if (this.notifications.length > 0) {
                const newest = this.notifications[0];
                if (!newest.is_read && newest.id > this.lastSeenId) {
                    this.lastSeenId = newest.id;
                    this.showBanner(newest.message, newest.type);

                    // Show native browser notification (OS-level popup)
                    if ('Notification' in window && Notification.permission === 'granted') {
                        try {
                            const nativeNotif = new Notification('EDTECH Studio', {
                                body: newest.message,
                                icon: '/icons/icon-192.png',
                                badge: '/icons/icon-72.png',
                                tag: 'edtech-' + newest.id,
                                silent: false
                            });
                            nativeNotif.onclick = () => {
                                window.focus();
                                nativeNotif.close();
                            };
                            // Auto-close after 10s
                            setTimeout(() => nativeNotif.close(), 10000);
                        } catch (e) {
                            // Fallback: some browsers don't support Notification constructor
                        }
                    }
                }
            }

            // Update dropdown if open
            if (this.isOpen) this.renderList();
        } catch (e) {
            // Silently fail — table might not exist yet
        }
    },

    updateBadge() {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;
        if (this.unreadCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
        } else {
            badge.style.display = 'none';
        }
    },

    showBanner(message, type = 'info') {
        const banner = document.getElementById('notification-banner');
        const text = document.getElementById('notification-banner-text');
        if (!banner || !text) return;

        text.textContent = message;
        banner.className = `notification-banner notification-banner-${type || 'info'} notification-banner-visible`;

        // Auto-hide after 8 seconds
        clearTimeout(this._bannerTimeout);
        this._bannerTimeout = setTimeout(() => this.hideBanner(), 8000);
    },

    hideBanner() {
        const banner = document.getElementById('notification-banner');
        if (banner) banner.classList.remove('notification-banner-visible');
    },

    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    },

    openDropdown() {
        this.isOpen = true;
        const panel = document.getElementById('notification-dropdown');
        if (panel) panel.style.display = 'block';
        this.renderList();
    },

    closeDropdown() {
        this.isOpen = false;
        const panel = document.getElementById('notification-dropdown');
        if (panel) panel.style.display = 'none';
    },

    renderList() {
        const list = document.getElementById('notification-list');
        if (!list) return;

        if (!this.notifications || this.notifications.length === 0) {
            list.innerHTML = '<div class="notification-empty">Sin notificaciones</div>';
            return;
        }

        list.innerHTML = this.notifications.map(n => {
            const dt = new Date(n.created_at);
            const timeAgo = this.timeAgo(dt);
            const typeIcon = this.getTypeIcon(n.type);
            const unreadClass = n.is_read ? '' : 'notification-item-unread';
            return `
                <div class="notification-item ${unreadClass}" data-id="${n.id}" onclick="Notifications.markRead(${n.id})">
                    <div class="notification-item-icon ${n.type || 'info'}">${typeIcon}</div>
                    <div class="notification-item-body">
                        <div class="notification-item-message">${n.message}</div>
                        <div class="notification-item-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    getTypeIcon(type) {
        switch(type) {
            case 'scheduled': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
            case 'contacted': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
            case 'comment': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
            default: return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
        }
    },

    timeAgo(date) {
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        if (seconds < 60) return 'Ahora';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `Hace ${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Hace ${hours}h`;
        const days = Math.floor(hours / 24);
        return `Hace ${days}d`;
    },

    async markRead(id) {
        await API.put(`/notifications/${id}/read`);
        // Update locally
        const n = this.notifications.find(x => x.id === id);
        if (n) { n.is_read = 1; this.unreadCount = Math.max(0, this.unreadCount - 1); }
        this.updateBadge();
        this.renderList();
    },

    async markAllRead() {
        await API.put('/notifications/read-all');
        this.notifications.forEach(n => n.is_read = 1);
        this.unreadCount = 0;
        this.updateBadge();
        this.renderList();
        showToast('Todas las notificaciones marcadas como leídas', 'success');
    }
};

// ================================================
// Hito labels
// ================================================

const HITO_LABELS = {
    pagina_inicio: 'Pág. Inicio',
    hito_2: 'Hito II',
    hito_3: 'Hito III',
    hito_4: 'Hito IV',
    hito_5: 'Hito V',
    semanas: 'Semanas'
};

const SCRIPT_LABELS = {
    not_uploaded:      'Sin Guión',
    guion_pendiente:   'GUIÓN PENDIENTE',
    guion_revisado:    'GUIÓN REVISADO',
    uploaded_hito_v:   'Cargado (Hito V)',
    pending_review:    'Pendiente de Revisión',
    in_review:         'En Revisión',
    needs_corrections: 'Requiere Correcciones',
    approved:          'Revisado',
    // Backwards compat for old data
    pending:     'Pendiente (legacy)',
    in_progress: 'En Progreso (legacy)',
    completed:   'Terminado (legacy)'
};

const SCRIPT_COLORS = {
    not_uploaded:      { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
    guion_pendiente:   { bg: 'rgba(251,191,36,0.2)',   color: '#fbbf24' },
    guion_revisado:    { bg: 'rgba(52,211,153,0.2)',   color: '#34d399' },
    uploaded_hito_v:   { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
    pending_review:    { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
    in_review:         { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
    needs_corrections: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
    approved:          { bg: 'rgba(52,211,153,0.15)',  color: '#34d399' },
    pending:           { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
    in_progress:       { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
    completed:         { bg: 'rgba(52,211,153,0.15)',  color: '#34d399' }
};

// ================================================
// Goals management
// ================================================

const Goals = {
    subjects: [],

    async refresh() {
        if (!App.activeSemester) {
            document.getElementById('goals-subtitle').textContent = 'Primero crea un semestre';
            return;
        }
        document.getElementById('goals-subtitle').textContent = `Semestre ${App.activeSemester.name}`;
        this.subjects = await API.get(`/subjects?semester_id=${App.activeSemester.id}`);
        this.render();
    },

    render() {
        const list = document.getElementById('subjects-list');
        const empty = document.getElementById('subjects-empty');
        const subjects = this.subjects;

        // Stats
        const total = subjects.length;
        const completed = subjects.filter(s => s.completed).length;
        const inProg = subjects.filter(s => s.assignment_status === 'in_progress').length;
        const pending = total - completed - inProg;

        document.getElementById('goals-total').textContent = total;
        document.getElementById('goals-completed').textContent = completed;
        document.getElementById('goals-inprogress').textContent = inProg;
        document.getElementById('goals-pending-stat').textContent = Math.max(0, pending);

        if (subjects.length === 0) {
            list.innerHTML = '';
            list.appendChild(empty.cloneNode ? document.getElementById('subjects-empty').cloneNode(true) : empty);
            empty.style.display = '';
            return;
        }

        // Remove empty state  
        const existingEmpty = list.querySelector('.empty-state');
        if (existingEmpty) existingEmpty.remove();

        let html = '';
        for (const s of subjects) {
            let statusClass = 's-pending';
            let statusText = 'Pendiente';
            if (s.completed) { statusClass = 's-completed'; statusText = 'Completada'; }
            else if (s.assignment_status === 'in_progress') { statusClass = 's-in_progress'; statusText = 'En progreso'; }

            const hitoText = s.last_hito_reached ? HITO_LABELS[s.last_hito_reached] || '' : '';

            const canEdit = App.user && ['admin', 'post_productor'].includes(App.user.role);

            const typeLabel = s.subject_type || 'Teórica';
            const typeColors = {
                'Teórica':   { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
                'Numérica':  { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
                'Proyecto Integrador': { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
            };
            const tc = typeColors[typeLabel] || typeColors['Teórica'];

            html += `<div class="subject-item" data-id="${s.id}">
                <span class="subject-code">${s.code}</span>
                <span class="subject-name">${s.name}</span>
                <div class="subject-badges">
                    <span class="subject-type-tag" style="background:${tc.bg};color:${tc.color}">${typeLabel}</span>
                    ${hitoText ? `<span class="subject-hito">Últ: ${hitoText}</span>` : ''}
                    ${s.script_status ? (() => {
                        const sc = SCRIPT_COLORS[s.script_status] || SCRIPT_COLORS['not_uploaded'];
                        const sl = SCRIPT_LABELS[s.script_status] || s.script_status;
                        return `<span class="subject-script" style="background:${sc.bg};color:${sc.color}">${sl}</span>`;
                    })() : ''}
                    <span class="subject-status ${statusClass}">${statusText}</span>
                </div>
                <div class="subject-actions">
                    ${canEdit ? `
                    <button class="btn-icon" style="color: ${s.completed ? 'var(--green)' : 'var(--text-muted)'}" onclick="Goals.toggleComplete(${s.id}, ${s.completed})" title="${s.completed ? 'Desmarcar' : 'Completar'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </button>
                    <button class="btn-icon" onclick="Goals.deleteSubject(${s.id})" title="Eliminar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                    ` : ''}
                </div>
            </div>`;
        }
        list.innerHTML = html;
    },

    async toggleComplete(id, currentState) {
        await API.put(`/subjects/${id}`, { completed: !currentState });
        showToast(currentState ? 'Materia desmarcada' : 'Materia completada', 'success');
        this.refresh();
        Dashboard.refresh();
    },

    async deleteSubject(id) {
        Calendar.showConfirm({
            title: 'Eliminar Materia',
            message: '¿Eliminar esta materia? Si tiene filmaciones asignadas también se eliminarán.'
        }, async () => {
            await API.del(`/subjects/${id}`);
            showToast('Materia eliminada', 'success');
            this.refresh();
            Dashboard.refresh();
        });
    },

    async deleteAllSubjects() {
        if (!App.activeSemester) return;
        const total = this.subjects.length;
        if (total === 0) return showToast('No hay materias para eliminar', 'error');
        Calendar.showConfirm({
            title: 'Eliminar TODAS las Materias',
            message: `¿Estás seguro de eliminar las ${total} materias del semestre "${App.activeSemester.name}"? Esta acción NO se puede deshacer.`
        }, async () => {
            const result = await API.post('/subjects/bulk-delete', { semester_id: App.activeSemester.id });
            showToast(`${result.deleted || total} materias eliminadas`, 'success');
            this.refresh();
            Dashboard.refresh();
        });
    }
};

// ================================================
// Init
// ================================================

document.addEventListener('DOMContentLoaded', () => App.init());
