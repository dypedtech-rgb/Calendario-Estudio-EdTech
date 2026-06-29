-- =============================================
-- EdTech Studio - Supabase (PostgreSQL) Schema
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================

-- Enable UUID extension (optional, we use SERIAL for IDs)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS semesters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL DEFAULT 'EXT',
    name VARCHAR(255) NOT NULL,
    subject_type VARCHAR(50) DEFAULT 'Teórica',
    semester_id INT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role TEXT NOT NULL DEFAULT 'academica' CHECK (role IN ('admin', 'post_productor', 'academica')),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default users (password is plain text; will be hashed on first login or reset)
INSERT INTO users (username, password, role, name)
VALUES ('admin', 'admin', 'admin', 'Administrador')
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, password, role, name)
VALUES ('Israx', 'Poteto2023*', 'admin', 'Israx')
ON CONFLICT (username) DO NOTHING;

CREATE TABLE IF NOT EXISTS filming_assignments (
    id SERIAL PRIMARY KEY,
    teacher_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    drive_link TEXT,
    script_status TEXT DEFAULT 'not_uploaded',
    status TEXT DEFAULT 'in_progress',
    sede VARCHAR(100) DEFAULT 'La Paz',
    flight_ticket_path VARCHAR(255),
    last_hito_reached TEXT,
    assigned_staff TEXT,
    bitacora TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recording_sessions (
    id SERIAL PRIMARY KEY,
    assignment_id INT NOT NULL REFERENCES filming_assignments(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    hito_reached TEXT,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'scheduled',
    staff_1_id INT REFERENCES users(id) ON DELETE SET NULL,
    staff_2_id INT REFERENCES users(id) ON DELETE SET NULL,
    staff_3_id INT REFERENCES users(id) ON DELETE SET NULL,
    staff_4_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closed_weeks (
    id SERIAL PRIMARY KEY,
    week_start DATE NOT NULL UNIQUE,
    reason VARCHAR(255) DEFAULT 'Estudio cerrado',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    reason VARCHAR(255) DEFAULT 'Reserva',
    is_displacement BOOLEAN DEFAULT FALSE,
    attendees TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_teachers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subject_code VARCHAR(50),
    subject VARCHAR(255) NOT NULL,
    subject_type VARCHAR(50) DEFAULT 'Teórica',
    phone VARCHAR(50),
    sede VARCHAR(100) DEFAULT 'La Paz',
    flight_ticket_path VARCHAR(255),
    is_external BOOLEAN DEFAULT FALSE,
    notes TEXT,
    drive_link TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    resolved BOOLEAN DEFAULT FALSE,
    added_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value VARCHAR(255) NOT NULL
);

INSERT INTO settings (key, value) VALUES ('studio_start_time', '08:00') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('studio_end_time', '18:00') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('studio_days', '1,2,3,4,5') ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_sessions (
    token VARCHAR(255) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id INT,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    from_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    from_user_name VARCHAR(255),
    type VARCHAR(50),
    message TEXT,
    entity_type VARCHAR(100),
    entity_id INT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS global_subjects (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    subject_type VARCHAR(50) DEFAULT 'Teórica',
    career VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(code, name)
);

CREATE TABLE IF NOT EXISTS meeting_requests (
    id SERIAL PRIMARY KEY,
    requester_name VARCHAR(255) NOT NULL,
    requester_contact VARCHAR(255),
    requested_date DATE NOT NULL,
    start_time VARCHAR(10) NOT NULL,
    end_time VARCHAR(10) NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    reviewed_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
