// ================================================
// Dashboard Module
// ================================================

const Dashboard = {
    async refresh() {
        const data = await API.get('/dashboard');

        // Next session
        const nextEl = document.getElementById('dash-next-value');
        const nextSub = document.getElementById('dash-next-sub');
        if (data.nextSession) {
            nextEl.textContent = `${data.nextSession.teacher_name}`;
            const d = data.nextSession.session_date;
            const parts = d.split('-');
            const dateFormatted = `${parts[2]}/${parts[1]}`;
            nextSub.textContent = `${data.nextSession.subject_code} — ${dateFormatted} ${data.nextSession.start_time?.substring(0,5)}`;
        } else {
            nextEl.textContent = 'Sin grabaciones';
            nextSub.textContent = 'programadas';
        }

        // Counts
        document.getElementById('dash-done-value').textContent = data.completedSubjects || 0;
        document.getElementById('dash-pending-value').textContent = data.pendingSubjects || 0;
        document.getElementById('dash-inprogress-value').textContent = data.inProgressSubjects || 0;

        // Progress bar
        const total = data.totalSubjects || 0;
        const completed = data.completedSubjects || 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        document.getElementById('progress-percent').textContent = `${pct}%`;
        document.getElementById('progress-fill').style.width = `${pct}%`;
    }
};
