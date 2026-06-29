// ================================================
// Admin Panel — User Management, Global Subjects, Activity Log
// ================================================

const AdminPanel = {
    users: [],
    globalSubjects: [],
    log: [],
    activeTab: 'users',

    init() {
        document.getElementById('admin-tab-users')?.addEventListener('click', () => this.switchTab('users'));
        document.getElementById('admin-tab-subjects')?.addEventListener('click', () => this.switchTab('subjects'));
        document.getElementById('admin-tab-log')?.addEventListener('click', () => this.switchTab('log'));

        // User management
        document.getElementById('btn-save-new-user')?.addEventListener('click', () => this.createUser());
        document.getElementById('btn-copy-whatsapp')?.addEventListener('click', () => this.copyToWhatsApp());

        // Auto-generate username from full name
        document.getElementById('new-user-name')?.addEventListener('input', (e) => {
            const usernameField = document.getElementById('new-user-username');
            // Only auto-fill if user hasn't manually edited the username field
            if (!usernameField.dataset.manuallyEdited) {
                usernameField.value = this.generateUsername(e.target.value);
            }
            // Hide success box if typing new user
            document.getElementById('new-user-success-box').style.display = 'none';
        });
        document.getElementById('new-user-username')?.addEventListener('input', function() {
            this.dataset.manuallyEdited = this.value ? 'yes' : '';
        });

        // Global subjects
        document.getElementById('btn-add-global-subject')?.addEventListener('click', () => this.addGlobalSubject());
        document.getElementById('btn-import-global-subjects')?.addEventListener('click', () => this.importBulkSubjects());
    },

    // Generate a username from a full name: "Edson Israel Llanque" → "eillanque"
    generateUsername(fullName) {
        const parts = fullName.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '';
        if (parts.length === 1) return parts[0];
        // First letter of each word except last, then full last word
        const initials = parts.slice(0, -1).map(p => p.charAt(0)).join('');
        return initials + parts[parts.length - 1];
    },

    async refresh() {
        if (App.user?.role !== 'admin') return;
        await this.loadTab(this.activeTab);
    },

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`admin-tab-${tab}`)?.classList.add('active');
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.style.display = 'none');
        document.getElementById(`admin-panel-${tab}`)?.style.display && (document.getElementById(`admin-panel-${tab}`).style.display = '');
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`admin-panel-${tab}`)?.classList.add('active');
        this.loadTab(tab);
    },

    async loadTab(tab) {
        if (tab === 'users') await this.loadUsers();
        if (tab === 'subjects') await this.loadGlobalSubjects();
        if (tab === 'log') await this.loadLog();
    },

    // ---- USERS ----
    async loadUsers() {
        this.users = await API.get('/users');
        this.renderUsers();
    },

    renderUsers() {
        const list = document.getElementById('admin-users-list');
        if (!list) return;
        const roleLabel = { admin: 'Admin', post_productor: 'Post-Producción', academica: 'Académica' };
        const roleClass = { admin: 'role-admin', post_productor: 'role-postprod', academica: 'role-academica' };

        list.innerHTML = this.users.map(u => `
            <div class="admin-user-row" data-id="${u.id}">
                <div class="admin-user-avatar">${u.name.charAt(0).toUpperCase()}</div>
                <div class="admin-user-info">
                    <div class="admin-user-name">${u.name}</div>
                    <div class="admin-user-username">@${u.username}</div>
                </div>
                <span class="role-badge ${roleClass[u.role] || ''}">${roleLabel[u.role] || u.role}</span>
                <div class="admin-user-actions">
                    <select class="input select role-select" data-uid="${u.id}" ${u.id === App.user.id ? 'disabled' : ''}>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="post_productor" ${u.role === 'post_productor' ? 'selected' : ''}>Post-Producción</option>
                        <option value="academica" ${u.role === 'academica' ? 'selected' : ''}>Académica</option>
                    </select>
                    ${u.id !== App.user.id ? `<button class="btn-icon btn-danger-icon" onclick="AdminPanel.deleteUser(${u.id})" title="Eliminar usuario">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>` : ''}
                </div>
            </div>
        `).join('');

        // Bind role change selects
        list.querySelectorAll('.role-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const uid = +sel.dataset.uid;
                await API.put(`/users/${uid}`, { role: e.target.value });
                showToast('Rol actualizado', 'success');
                await this.loadUsers();
            });
        });
    },

    async createUser() {
        const name = document.getElementById('new-user-name').value.trim();
        const username = document.getElementById('new-user-username').value.trim().toLowerCase().replace(/\s+/g, '');
        const password = document.getElementById('new-user-password').value.trim();
        const role = document.getElementById('new-user-role').value;

        if (!name || !username || !password) return showToast('Todos los campos son requeridos', 'error');

        const result = await API.post('/users', { name, username, password, role });
        if (result.error) {
            if (result.error.includes('ya existe')) {
                showToast(`El usuario "${username}" ya está en uso. Prueba con "${username}2" o un nombre diferente.`, 'error');
                // Suggest alternative
                document.getElementById('new-user-username').value = username + '2';
                document.getElementById('new-user-username').dataset.manuallyEdited = 'yes';
            } else {
                showToast(result.error, 'error');
            }
            return;
        }

        showToast(`Usuario "${name}" creado correctamente`, 'success');
        
        // Show success box with credentials for WhatsApp
        const roleLabel = { admin: 'Administrador', post_productor: 'Post-Producción', academica: 'Académica' }[role] || role;
        
        this.lastCreatedUser = {
            name,
            username,
            password,
            role: roleLabel
        };
        
        document.getElementById('new-user-success-text').textContent = `${name} (@${username})`;
        document.getElementById('new-user-success-box').style.display = 'flex';
        
        // Clear fields
        document.getElementById('new-user-name').value = '';
        const unField = document.getElementById('new-user-username');
        unField.value = '';
        unField.dataset.manuallyEdited = '';
        document.getElementById('new-user-password').value = '';
        await this.loadUsers();
    },

    async copyToWhatsApp() {
        if (!this.lastCreatedUser) return;
        const u = this.lastCreatedUser;
        const url = window.location.origin + window.location.pathname;
        
        const text = `Hola ${u.name}, estas son tus credenciales de acceso al Calendario de Filmaciones (${u.role}):

🌐 *Enlace:* ${url}
👤 *Usuario:* ${u.username}
🔑 *Contraseña:* ${u.password}

_Por favor, guarda estos datos de forma segura._`;

        try {
            await navigator.clipboard.writeText(text);
            const btn = document.getElementById('btn-copy-whatsapp');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ¡Copiado!`;
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
        } catch (err) {
            showToast('No se pudo copiar al portapapeles', 'error');
        }
    },

    async deleteUser(id) {
        const u = this.users.find(x => x.id === id);
        Calendar.showConfirm({
            title: 'Eliminar Usuario',
            message: `¿Eliminar a "${u?.name || 'este usuario'}"? Se cerrarán todas sus sesiones activas.`
        }, async () => {
            const result = await API.del(`/users/${id}`);
            if (result.error) return showToast(result.error, 'error');
            showToast('Usuario eliminado', 'success');
            await this.loadUsers();
        });
    },

    // ---- GLOBAL SUBJECTS ----
    async loadGlobalSubjects() {
        this.globalSubjects = await API.get('/global-subjects');
        this.renderGlobalSubjects();
    },

    renderGlobalSubjects() {
        const list = document.getElementById('global-subjects-list');
        if (!list) return;

        const countEl = document.getElementById('gs-count');
        if (countEl) countEl.textContent = this.globalSubjects.length;

        if (this.globalSubjects.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>No hay materias globales aún</p><span>Agrega materias o importa desde texto CSV</span></div>';
            return;
        }

        list.innerHTML = this.globalSubjects.map(s => `
            <div class="gs-row">
                <span class="gs-code">${s.code}</span>
                <span class="gs-name">${s.name}</span>
                ${s.career ? `<span class="gs-career">${s.career}</span>` : '<span></span>'}
                <button class="btn-icon btn-danger-icon" onclick="AdminPanel.deleteGlobalSubject(${s.id})" title="Eliminar">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
            </div>
        `).join('');
    },

    async addGlobalSubject() {
        const code = document.getElementById('gs-code').value.trim();
        const name = document.getElementById('gs-name').value.trim();
        const career = document.getElementById('gs-career').value.trim();
        if (!code || !name) return showToast('Código y nombre requeridos', 'error');
        const result = await API.post('/global-subjects', { code, name, career });
        if (result.error) return showToast(result.error, 'error');
        document.getElementById('gs-code').value = '';
        document.getElementById('gs-name').value = '';
        document.getElementById('gs-career').value = '';
        showToast('Materia agregada', 'success');
        await this.loadGlobalSubjects();
    },

    async importBulkSubjects() {
        const raw = document.getElementById('gs-bulk-import').value.trim();
        if (!raw) return showToast('Ingresa datos para importar', 'error');

        // Parse: each line is "CODE - Name (Career)" or "CODE,Name,Career" or "CODE\tName"
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        const subjects = [];
        for (const line of lines) {
            // Try comma, tab, or " - " separator
            let parts = line.includes(',') ? line.split(',') : line.includes('\t') ? line.split('\t') : line.split(' - ');
            if (parts.length >= 2) {
                subjects.push({ code: parts[0].trim(), name: parts[1].trim(), career: parts[2]?.trim() || null });
            }
        }
        if (subjects.length === 0) return showToast('No se pudo parsear ninguna materia. Usa formato: CÓDIGO,Nombre', 'error');

        const result = await API.post('/global-subjects/bulk', { subjects });
        if (result.error) return showToast(result.error, 'error');
        document.getElementById('gs-bulk-import').value = '';
        showToast(`Importadas: ${result.inserted} materias`, 'success');
        await this.loadGlobalSubjects();
    },

    async deleteGlobalSubject(id) {
        await API.del(`/global-subjects/${id}`);
        showToast('Materia eliminada', 'success');
        await this.loadGlobalSubjects();
    },

    // ---- ACTIVITY LOG ----
    async loadLog() {
        this.log = await API.get('/activity-log?limit=100');
        this.renderLog();
    },

    renderLog() {
        const list = document.getElementById('activity-log-list');
        if (!list) return;

        if (!this.log || this.log.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Sin actividad registrada aún</p></div>';
            return;
        }

        list.innerHTML = this.log.map(entry => {
            const dt = new Date(entry.created_at);
            const dateStr = dt.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="log-entry">
                    <div class="log-avatar">${entry.user_name.charAt(0).toUpperCase()}</div>
                    <div class="log-body">
                        <span class="log-user">${entry.user_name}</span>
                        <span class="log-action">${entry.action}</span>
                        ${entry.details ? `<span class="log-details">${entry.details}</span>` : ''}
                    </div>
                    <div class="log-time">
                        <span>${dateStr}</span>
                        <span>${timeStr}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => AdminPanel.init(), 200);
});
