-- =============================================
-- Education Management SaaS — Database Schema (Revision 11)
-- Tenant = institutions (school | college | coaching | private_batch)
-- Academic structure = programs -> batches -> enrollments
-- This file is the single source of truth for the database.
-- Rule: every business code (student_id, receipt_no, employee_id ...) is
--       unique PER INSTITUTION, never globally.
-- =============================================

-- SaaS Layer
CREATE TABLE subscription_plans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration_days INT NOT NULL,
    max_students INT DEFAULT -1,
    max_teachers INT DEFAULT -1,
    max_sms INT DEFAULT 1000,
    -- R6: NULL = plan is offered to every institution type
    institution_type ENUM('school','college','coaching','private_batch') NULL,
    max_batches INT DEFAULT -1,
    sort_order INT DEFAULT 0,
    features JSON,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE institutions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,           -- default subdomain: {slug}.APP_BASE_DOMAIN
    -- R6: custom domains live in institution_domains (see docs/modules/custom-domain.md)
    institution_type ENUM('school','college','coaching','private_batch') NOT NULL DEFAULT 'school',
    enabled_modules JSON NULL,                   -- Super Admin overrides: {"hostel": true, "library": false}
    terminology JSON NULL,                       -- label overrides: {"batch": {"bn": "শাখা", "en": "Section"}}
    settings JSON NULL,                          -- {"fee_proration": "none", "use_programs": true, ...}
    sms_balance DECIMAL(10,2) NOT NULL DEFAULT 0, -- D56: SMS wallet in TAKA (recharged online / by Super Admin; each sent part costs the platform rate)
    sms_sender_id VARCHAR(20) NULL,              -- D59: the institution's own sender ID on its own API (masking name or a 13-digit number)
    sms_sender_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
    sms_sender_note VARCHAR(255) NULL,           -- rejection reason / Super Admin note
    onboarding_completed TINYINT(1) DEFAULT 0,
    onboarding_step INT DEFAULT 1,
    staff_department_mode ENUM('legacy','department') NOT NULL DEFAULT 'legacy', -- D101: per-institution rollout switch
    switched_by BIGINT UNSIGNED NULL,
    switched_at TIMESTAMP NULL,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(100),
    subscription_plan_id BIGINT UNSIGNED,
    subscription_expires_at TIMESTAMP NULL,
    status ENUM('trial','active','expired','suspended','inactive') DEFAULT 'trial',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id)
);

CREATE TABLE payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    method ENUM('bkash','nagad','card','cash','ssl','coupon') NOT NULL,   -- R11: 'coupon' = a free-days coupon redeemed with no money moved
    trx_id VARCHAR(100) UNIQUE,
    status ENUM('pending','completed','failed','refunded') DEFAULT 'pending',
    paid_at TIMESTAMP NULL,
    invoice_no VARCHAR(50) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- Core Tables
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED,
    name VARCHAR(100) NOT NULL,
    -- R6: login identifier is email OR phone OR username, unique per institution
    email VARCHAR(100) NULL,
    phone VARCHAR(20) NULL,                      -- staff/parent login; NULL for student users
    username VARCHAR(50) NULL,                   -- student login = students.student_id
    password VARCHAR(255) NOT NULL,
    role ENUM('super_admin','admin','teacher','student','parent','accountant','content_writer','content_moderator','institution_staff') NOT NULL,   -- D65 platform roles; D88 institution_staff is an identity, department duties authorize access
    avatar VARCHAR(255),
    is_active TINYINT(1) DEFAULT 1,
    last_login_at TIMESTAMP NULL,
    locale VARCHAR(5) NULL,                      -- R9: personal language (bn|en|ar); VARCHAR so a new language needs no migration (docs/I18N.md)
    failed_login_attempts INT NOT NULL DEFAULT 0, -- R7: used by the login lockout (docs/AUTHORIZATION.md); was only a comment before
    locked_until TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,                  -- R7: soft delete (system-design-patterns.md 'Soft Delete Strategy'); the model uses SoftDeletes
    UNIQUE KEY unique_user_email (institution_id, email),
    UNIQUE KEY unique_user_phone (institution_id, phone),
    UNIQUE KEY unique_user_username (institution_id, username),
    UNIQUE KEY unique_user_tenant_identity (id, institution_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

ALTER TABLE institutions
    ADD CONSTRAINT institutions_switched_by_foreign FOREIGN KEY (switched_by) REFERENCES users(id);

-- R6: programs = Class (school) | Class+Group (college) | Course (coaching) | default "General" (private_batch)
CREATE TABLE programs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    numeric_name INT,                            -- school/college: 1..12 ; NULL for courses
    code VARCHAR(20) NULL,
    group_name ENUM('science','humanities','business','general') NULL,  -- class 9-12 groups
    duration_months INT NULL,                    -- coaching course length; NULL = ongoing
    course_fee DECIMAL(10,2) NULL,               -- one-time course fee (coaching)
    is_default TINYINT(1) DEFAULT 0,             -- private_batch auto-created "General" program
    is_active TINYINT(1) DEFAULT 1,
    is_public TINYINT(1) DEFAULT 1,              -- R6.2: listed on the public website
    public_description VARCHAR(500) NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_program_tenant_identity (id, institution_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- R6: batches = Section (school/college) | Batch (coaching/private_batch)
CREATE TABLE batches (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(60) NOT NULL,
    teacher_id BIGINT UNSIGNED,                  -- class teacher / batch owner
    academic_year_id BIGINT UNSIGNED NULL,       -- NULL for ongoing coaching batches
    start_date DATE NULL,
    end_date DATE NULL,
    schedule JSON NULL,                          -- [{"day":"sat","start":"16:00","end":"17:30"}]
    monthly_fee DECIMAL(10,2) NULL,              -- batch-level tuition (coaching/private_batch)
    room VARCHAR(30) NULL,
    max_capacity INT DEFAULT 40,
    status ENUM('upcoming','running','completed','archived') DEFAULT 'running',
    UNIQUE KEY unique_batch_tenant_identity (id, institution_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (program_id) REFERENCES programs(id)
);

CREATE TABLE students (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED,
    student_id VARCHAR(20) NOT NULL,
    -- R6: program_id / batch_id / roll_no are a CACHE of the primary active enrollment.
    --     Written ONLY by EnrollmentService. Source of truth = enrollments table.
    program_id BIGINT UNSIGNED NULL,
    batch_id BIGINT UNSIGNED NULL,
    roll_no INT,
    studying_at VARCHAR(150) NULL,               -- coaching: which school/college the student attends
    board_reg_no VARCHAR(30) NULL,
    board_roll_no VARCHAR(30) NULL,
    date_of_birth DATE,
    gender ENUM('male','female','other'),
    blood_group VARCHAR(5),
    religion VARCHAR(30),
    father_name VARCHAR(100),
    mother_name VARCHAR(100),
    guardian_phone VARCHAR(20) NOT NULL,
    address TEXT,
    photo VARCHAR(255),
    admission_date DATE,
    status ENUM('active','inactive','transferred') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,                  -- R7: soft delete (system-design-patterns.md 'Soft Delete Strategy'); the model uses SoftDeletes
    anonymized_at TIMESTAMP NULL,                -- R7: set by StudentErasureService (personal data removed, fee/exam history kept)
    UNIQUE KEY unique_student_code (institution_id, student_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (program_id) REFERENCES programs(id)
);

CREATE TABLE teachers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED,
    employee_id VARCHAR(20) NOT NULL,
    designation VARCHAR(50),
    department VARCHAR(50),
    joining_date DATE,
    qualification TEXT,
    salary DECIMAL(10,2),
    house_rent DECIMAL(8,2) DEFAULT 0,           -- R6.5: used by SalaryService (hr-payroll-module.md); were only in the module doc
    medical_allowance DECIMAL(8,2) DEFAULT 0,
    transport_allowance DECIMAL(8,2) DEFAULT 0,
    status ENUM('active','inactive','on_leave') DEFAULT 'active',
    deleted_at TIMESTAMP NULL,                  -- R7: soft delete (system-design-patterns.md 'Soft Delete Strategy'); the model uses SoftDeletes
    UNIQUE KEY unique_employee_code (institution_id, employee_id),
    UNIQUE KEY unique_teacher_tenant_identity (id, institution_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- Academic Tables
CREATE TABLE subjects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    full_marks INT DEFAULT 100,
    pass_marks INT DEFAULT 33,
    is_optional TINYINT(1) DEFAULT 0,            -- R6: optional / 4th subject (see docs/modules/college.md)
    UNIQUE KEY unique_subject_tenant_identity (id, institution_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (program_id) REFERENCES programs(id)
);

CREATE TABLE routines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED,
    subject_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    day_of_week ENUM('sat','sun','mon','tue','wed','thu') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room_no VARCHAR(20),
    UNIQUE KEY unique_routine_tenant_identity (id, institution_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE exams (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,               -- R6: NULL = whole program; set = single batch test
    exam_type ENUM('term','class_test','weekly','model_test','admission') DEFAULT 'term',
    academic_year YEAR NOT NULL,
    start_date DATE,
    end_date DATE,
    status ENUM('upcoming','ongoing','completed','published') DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE results (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    marks_obtained DECIMAL(6,2),                 -- total for this subject in this exam (= sum of component_marks when components are used)
    component_marks JSON NULL,                   -- R6.3: {"written":52,"mcq":18,"practical":25} when exam_subjects.components is set
    percentage DECIMAL(5,2) NULL,                -- marks_obtained / exam_subjects.full_marks * 100 (server-computed)
    grade VARCHAR(5),
    grade_point DECIMAL(3,2),
    is_absent TINYINT(1) DEFAULT 0,
    is_pass TINYINT(1) NULL,                     -- R6.3: total pass AND every component pass rule (server-computed)
    teacher_remarks VARCHAR(255) NULL,           -- R6.5: per-subject remark shown on the report card (progress-report.md)
    UNIQUE KEY unique_result (exam_id, student_id, subject_id),
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE attendances (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,           -- R6: attendance is taken per batch
    date DATE NOT NULL,
    status ENUM('present','absent','late','leave') NOT NULL,
    note VARCHAR(255),
    taken_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance (institution_id, student_id, batch_id, date),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE homeworks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,               -- R6: NULL = whole program; set = one batch only (see docs/modules/academic-structure.md "Targeting Rule")
    subject_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    file_path VARCHAR(255),
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL                  -- R7: soft delete (system-design-patterns.md 'Soft Delete Strategy'); the model uses SoftDeletes
);

-- Financial Tables
CREATE TABLE fee_categories (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    frequency ENUM('monthly','yearly','once') DEFAULT 'monthly',
    applicable_to ENUM('all','program_specific') DEFAULT 'all',
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE fee_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    enrollment_id BIGINT UNSIGNED NULL,          -- R6: which enrollment this fee belongs to
    online_payment_id BIGINT UNSIGNED NULL,      -- R6.2: set when paid online by a parent (online_payments.id)
    batch_id BIGINT UNSIGNED NULL,               -- R6: denormalised from enrollment for reports
    fee_category_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    paid_amount DECIMAL(10,2) NOT NULL,
    month VARCHAR(7),
    payment_method VARCHAR(30) DEFAULT 'cash',   -- R6.4: cash | bkash | nagad | card | banglaqr | ... (VARCHAR: new gateways add values without a migration)
    receipt_no VARCHAR(50) NOT NULL,             -- one receipt can have several lines (several dues paid together)
    line_no TINYINT UNSIGNED NOT NULL DEFAULT 1, -- R6.2: 1..n inside one receipt
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    collected_by BIGINT UNSIGNED,
    status ENUM('paid','partial','waived','reversed') DEFAULT 'paid',   -- R10: 'reversed' = a reversing line (negative paid_amount, reverses_id set); original rows are never edited (D32)
    UNIQUE KEY unique_receipt_line (institution_id, receipt_no, line_no),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE expenses (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    category VARCHAR(100) NOT NULL,
    title VARCHAR(150) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    expense_date DATE NOT NULL,
    note TEXT,
    receipt_path VARCHAR(255),
    added_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reversal_of_id BIGINT UNSIGNED NULL,
    replaces_expense_id BIGINT UNSIGNED NULL,
    UNIQUE KEY unique_expenses_inst_id (institution_id, id),
    UNIQUE KEY unique_expenses_reversal (institution_id, reversal_of_id),
    UNIQUE KEY unique_expenses_replacement (institution_id, replaces_expense_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    CONSTRAINT fk_expenses_reversal FOREIGN KEY (institution_id, reversal_of_id) REFERENCES expenses(institution_id, id),
    CONSTRAINT fk_expenses_replacement FOREIGN KEY (institution_id, replaces_expense_id) REFERENCES expenses(institution_id, id)
);

-- (R10) salary_payments was replaced by payroll_runs + payroll_items - docs/modules/staff-payroll.md
-- Communication Tables
CREATE TABLE notices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL,
    target ENUM('all','students','teachers','parents') DEFAULT 'all',
    program_id BIGINT UNSIGNED,
    batch_id BIGINT UNSIGNED NULL,               -- R6: NULL = whole program; set = one batch only (see docs/modules/academic-structure.md "Targeting Rule")
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    attachment VARCHAR(255),
    is_public TINYINT(1) DEFAULT 0,              -- R6.2: show on the public website (docs/modules/public-website.md)
    created_by BIGINT UNSIGNED,
    deleted_at TIMESTAMP NULL,                  -- R7: soft delete (system-design-patterns.md 'Soft Delete Strategy'); the model uses SoftDeletes
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    from_user_id BIGINT UNSIGNED NOT NULL,
    to_user_id BIGINT UNSIGNED NOT NULL,
    body TEXT NOT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sms_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    to_phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('sent','failed') DEFAULT 'sent',
    segments TINYINT UNSIGNED NOT NULL DEFAULT 1, -- R9: SMS parts billed (Unicode = 70/67 chars, GSM-7 = 160/153) - docs/I18N.md section 7
    encoding VARCHAR(10) NOT NULL DEFAULT 'gsm',  -- gsm | unicode
    sender_id VARCHAR(20) NULL,                  -- R6.2: the sender ID actually used
    fallback_used TINYINT(1) DEFAULT 0,          -- R6.2: institution sender failed, platform sender used instead
    error VARCHAR(255) NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_by BIGINT UNSIGNED
);

CREATE TABLE audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED,
    user_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(100) NOT NULL,
    model VARCHAR(50),
    model_id BIGINT UNSIGNED,
    old_data JSON,
    new_data JSON,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_students_institution ON students(institution_id);
CREATE INDEX idx_students_program ON students(program_id);
CREATE INDEX idx_attendance_date ON attendances(institution_id, date);
CREATE INDEX idx_results_exam ON results(exam_id, student_id);
CREATE INDEX idx_fee_payments_student ON fee_payments(student_id, month);
CREATE INDEX idx_users_institution_role ON users(institution_id, role);

-- =============================================
-- Extra Module Tables
-- =============================================

-- FCM Token (Mobile Push Notification)
ALTER TABLE users ADD COLUMN fcm_token VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN notification_preferences JSON NULL;
-- {"sms": true, "push": true, "inapp": true, "absent_alert": true, "fee_reminder": true}

-- Academic Calendar & Holidays
CREATE TABLE academic_years (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(20) NOT NULL,       -- '2024-2025'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE holidays (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    date DATE NOT NULL,
    type ENUM('public','institution','optional') DEFAULT 'public',
    description VARCHAR(255),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- Exam Seating Arrangement
CREATE TABLE exam_seat_plans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    room_name VARCHAR(50),
    seat_number VARCHAR(20),
    seat_row INT,
    column_number INT,
    UNIQUE KEY unique_seat (exam_id, room_name, seat_number),
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Student Documents
CREATE TABLE student_documents (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    type ENUM('birth_certificate','national_id','previous_marksheet',
              'passport_photo','transfer_certificate','medical_certificate','other') NOT NULL,
    title VARCHAR(150),
    file_path VARCHAR(500) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Fee Waiver Requests
CREATE TABLE fee_waivers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    fee_category_id BIGINT UNSIGNED NOT NULL,
    waiver_type ENUM('full','partial','sibling_discount') DEFAULT 'partial',
    waiver_amount DECIMAL(8,2),
    waiver_percentage DECIMAL(5,2),
    reason TEXT,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    approved_by BIGINT UNSIGNED NULL,
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Class-wise Fee Structure
CREATE TABLE fee_structures (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL DEFAULT 0, -- R6: 0 = program-level amount; >0 = batch-specific override (0, not NULL: UNIQUE ignores NULLs)
    fee_category_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    academic_year_id BIGINT UNSIGNED NOT NULL DEFAULT 0,   -- 0 = not tied to a year (coaching)
    UNIQUE KEY unique_fee_structure (program_id, batch_id, fee_category_id, academic_year_id),
    FOREIGN KEY (program_id) REFERENCES programs(id),
    FOREIGN KEY (fee_category_id) REFERENCES fee_categories(id)
);

-- Parent-Child Linking (একজন parent-এর একাধিক সন্তান)
CREATE TABLE parent_student (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    parent_user_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    relationship ENUM('father','mother','guardian') DEFAULT 'guardian',
    is_primary TINYINT(1) DEFAULT 0,
    UNIQUE KEY unique_parent_student (parent_user_id, student_id),
    FOREIGN KEY (parent_user_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Teacher Subject Assignment Matrix
CREATE TABLE teacher_subjects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,
    is_primary TINYINT(1) DEFAULT 1,
    UNIQUE KEY unique_teacher_subject (teacher_id, subject_id, program_id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- Subscription Invoices
CREATE TABLE subscription_invoices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payment_id BIGINT UNSIGNED NOT NULL,
    invoice_number VARCHAR(30) UNIQUE NOT NULL,  -- INV-2025-00001
    plan_name VARCHAR(50) NOT NULL,
    billing_period VARCHAR(30),   -- 'Jan 2025 - Jan 2026'
    amount DECIMAL(10,2) NOT NULL,
    tax DECIMAL(8,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (payment_id) REFERENCES payments(id)
);

-- Library Tables
CREATE TABLE books (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(150),
    isbn VARCHAR(20),
    category VARCHAR(100),
    total_copies INT DEFAULT 1,
    available_copies INT DEFAULT 1,
    shelf_location VARCHAR(50),
    published_year YEAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE book_issues (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    book_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    issued_by BIGINT UNSIGNED NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE NULL,
    fine_amount DECIMAL(8,2) DEFAULT 0,
    fine_paid TINYINT(1) DEFAULT 0,
    status ENUM('issued','returned','overdue') DEFAULT 'issued',
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Transport Tables
CREATE TABLE vehicles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    number_plate VARCHAR(20) NOT NULL,
    capacity INT NOT NULL,
    driver_name VARCHAR(100),
    driver_phone VARCHAR(20),
    helper_name VARCHAR(100),
    status ENUM('active','maintenance','inactive') DEFAULT 'active'
);

CREATE TABLE transport_routes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    vehicle_id BIGINT UNSIGNED,
    morning_departure TIME,
    afternoon_departure TIME,
    monthly_fee DECIMAL(8,2),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

CREATE TABLE route_stops (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    route_id BIGINT UNSIGNED NOT NULL,
    stop_name VARCHAR(100) NOT NULL,
    pickup_time TIME,
    drop_time TIME,
    sequence INT NOT NULL,
    FOREIGN KEY (route_id) REFERENCES transport_routes(id)
);

CREATE TABLE student_transport (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    route_id BIGINT UNSIGNED NOT NULL,
    stop_id BIGINT UNSIGNED,
    direction ENUM('both','pickup_only','drop_only') DEFAULT 'both',
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (route_id) REFERENCES transport_routes(id)
);

-- Hostel Tables
CREATE TABLE hostels (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    type ENUM('boys','girls') NOT NULL,
    total_rooms INT NOT NULL,
    warden_name VARCHAR(100),
    warden_phone VARCHAR(20)
);

CREATE TABLE hostel_rooms (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    hostel_id BIGINT UNSIGNED NOT NULL,
    room_number VARCHAR(20) NOT NULL,
    capacity INT NOT NULL,
    current_occupancy INT DEFAULT 0,
    floor INT DEFAULT 1,
    monthly_fee DECIMAL(8,2),
    FOREIGN KEY (hostel_id) REFERENCES hostels(id)
);

CREATE TABLE hostel_allocations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    room_id BIGINT UNSIGNED NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NULL,
    status ENUM('active','checked_out') DEFAULT 'active',
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (room_id) REFERENCES hostel_rooms(id)
);

-- Online Classes & Materials
CREATE TABLE online_classes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,               -- R6: NULL = whole program; set = one batch only (see docs/modules/academic-structure.md "Targeting Rule")
    subject_id BIGINT UNSIGNED,
    title VARCHAR(150) NOT NULL,
    description TEXT NULL,                       -- R6.5: was only in the module doc
    platform ENUM('zoom','google_meet','jitsi','custom') DEFAULT 'google_meet',
    meeting_link VARCHAR(500) NOT NULL,
    meeting_id VARCHAR(100),
    passcode VARCHAR(50),
    scheduled_at TIMESTAMP NOT NULL,
    duration_minutes INT DEFAULT 60,
    status ENUM('scheduled','live','completed','cancelled') DEFAULT 'scheduled',
    recording_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE class_materials (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,               -- R6: NULL = whole program; set = one batch only (see docs/modules/academic-structure.md "Targeting Rule")
    subject_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NULL,                       -- R6.5: was only in the module doc
    type ENUM('pdf','video','link','image','other') DEFAULT 'pdf',
    file_path VARCHAR(500),
    external_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL                  -- R7: soft delete (system-design-patterns.md 'Soft Delete Strategy'); the model uses SoftDeletes
);

-- Transfer Certificates
CREATE TABLE tc_certificates (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    tc_number VARCHAR(30) NOT NULL,              -- unique per institution (enforce in service + composite index)
    reason TEXT,
    last_class VARCHAR(50),
    last_attendance_date DATE,
    conduct VARCHAR(50) DEFAULT 'Good',
    issued_date DATE NOT NULL,
    issued_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leave Applications (HR)
CREATE TABLE leave_types (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    max_days_per_year INT DEFAULT 10,
    is_paid TINYINT(1) DEFAULT 1
);

CREATE TABLE leave_applications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,                -- R10: teacher (via users) OR staff_id below - exactly one, checked in the service
    leave_type_id BIGINT UNSIGNED NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    total_days INT NOT NULL,
    reason TEXT,
    status ENUM('pending','approved','rejected','cancelled') DEFAULT 'pending',
    approved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_leave_application_tenant_identity (id, institution_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Additional Indexes
CREATE INDEX idx_books_institution ON books(institution_id);
CREATE INDEX idx_book_issues_status ON book_issues(status, due_date);
CREATE INDEX idx_online_classes_scheduled ON online_classes(institution_id, scheduled_at);
CREATE INDEX idx_parent_student ON parent_student(parent_user_id);
CREATE INDEX idx_holidays_date ON holidays(institution_id, date);

-- Student Import Log
CREATE TABLE student_import_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    imported_by BIGINT UNSIGNED NOT NULL,
    filename VARCHAR(255) NOT NULL,
    total_rows INT DEFAULT 0,
    imported_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status ENUM('pending','processing','completed','failed') DEFAULT 'pending',
    error_log JSON NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_import_logs_institution ON student_import_logs(institution_id, created_at);

-- =============================================
-- New Feature Tables (Revision 4)
-- =============================================

-- Fee Installment
CREATE TABLE fee_installment_plans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    fee_category_id BIGINT UNSIGNED NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    installments INT NOT NULL DEFAULT 3,
    approved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE fee_installments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plan_id BIGINT UNSIGNED NOT NULL,
    institution_id BIGINT UNSIGNED NOT NULL,
    installment_no INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    due_date DATE NOT NULL,
    paid_at TIMESTAMP NULL,
    payment_id BIGINT UNSIGNED NULL,
    status ENUM('pending','paid','overdue') DEFAULT 'pending',
    FOREIGN KEY (plan_id) REFERENCES fee_installment_plans(id)
);

-- Homework Submissions
CREATE TABLE homework_submissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    homework_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    file_path VARCHAR(500),
    text_answer TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    grade VARCHAR(10) NULL,
    teacher_feedback TEXT NULL,
    feedback_at TIMESTAMP NULL,
    status ENUM('submitted','late','graded') DEFAULT 'submitted',
    UNIQUE KEY unique_submission (homework_id, student_id),
    FOREIGN KEY (homework_id) REFERENCES homeworks(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Online Exam / Quiz
CREATE TABLE online_exams (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,               -- R6: NULL = whole program; set = one batch only (see docs/modules/academic-structure.md "Targeting Rule")
    subject_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 60,
    total_marks INT DEFAULT 100,
    pass_marks INT DEFAULT 33,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    shuffle_questions TINYINT(1) DEFAULT 1,
    show_result_instantly TINYINT(1) DEFAULT 0,
    status ENUM('draft','published','live','ended') DEFAULT 'draft',
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exam_questions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    online_exam_id BIGINT UNSIGNED NOT NULL,
    question TEXT NOT NULL,
    type ENUM('mcq','true_false','short_answer') DEFAULT 'mcq',
    options JSON,
    correct_answer VARCHAR(255) NOT NULL,
    marks INT DEFAULT 1,
    explanation TEXT,
    FOREIGN KEY (online_exam_id) REFERENCES online_exams(id)
);

CREATE TABLE exam_attempts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    online_exam_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    answers JSON,
    score INT DEFAULT 0,
    percentage DECIMAL(5,2),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP NULL,
    time_taken_seconds INT,
    status ENUM('in_progress','submitted','graded') DEFAULT 'in_progress',
    UNIQUE KEY unique_attempt (online_exam_id, student_id),
    FOREIGN KEY (online_exam_id) REFERENCES online_exams(id)
);

-- Behavior Log
CREATE TABLE behavior_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    reported_by BIGINT UNSIGNED NOT NULL,
    type ENUM('positive','negative','neutral') DEFAULT 'neutral',
    category VARCHAR(100),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    action_taken TEXT,
    date DATE NOT NULL,
    parent_notified TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Health Records
CREATE TABLE student_health_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    height_cm DECIMAL(5,1),
    weight_kg DECIMAL(5,1),
    blood_group VARCHAR(5),
    vision_left VARCHAR(20),
    vision_right VARCHAR(20),
    medical_conditions TEXT,
    emergency_contact VARCHAR(100),
    emergency_phone VARCHAR(20),
    doctor_name VARCHAR(100),
    doctor_phone VARCHAR(20),
    last_checkup_date DATE,
    notes TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_health (student_id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Certificates
CREATE TABLE certificates (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    type ENUM('participation','merit','appreciation','completion') NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    issued_date DATE NOT NULL,
    issued_by BIGINT UNSIGNED NOT NULL,
    certificate_no VARCHAR(30) NOT NULL,         -- unique per institution (enforce in service + composite index)
    pdf_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Visitor Log
CREATE TABLE visitor_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    visitor_name VARCHAR(100) NOT NULL,
    visitor_phone VARCHAR(20),
    purpose VARCHAR(150) NOT NULL,
    whom_to_meet VARCHAR(100),
    id_type ENUM('nid','passport','driving_license','other') DEFAULT 'nid',
    id_number VARCHAR(50),
    check_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out TIMESTAMP NULL,
    badge_no VARCHAR(20),
    created_by BIGINT UNSIGNED NOT NULL
);

-- Parent Meetings
CREATE TABLE parent_meetings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    requested_by ENUM('parent','teacher','admin') DEFAULT 'teacher',
    subject VARCHAR(150) NOT NULL,
    proposed_date DATE NOT NULL,
    proposed_time TIME NOT NULL,
    location VARCHAR(100) DEFAULT 'School Office',
    status ENUM('pending','confirmed','cancelled','completed') DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Alumni
CREATE TABLE alumni (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NULL,
    name VARCHAR(100) NOT NULL,
    graduation_year YEAR NOT NULL,
    last_class VARCHAR(50),
    current_institution VARCHAR(150),
    current_profession VARCHAR(150),
    email VARCHAR(100),
    phone VARCHAR(20),
    achievements TEXT,
    is_verified TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTP Tokens (2FA)
CREATE TABLE otp_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    otp VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- users টেবিলে নতুন columns
ALTER TABLE users ADD COLUMN two_factor_enabled TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN whatsapp_number VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN whatsapp_enabled TINYINT(1) DEFAULT 0;

-- institutions টেবিলে branch support
ALTER TABLE institutions ADD COLUMN parent_institution_id BIGINT UNSIGNED NULL;
ALTER TABLE institutions ADD COLUMN branch_name VARCHAR(100) NULL;
ALTER TABLE institutions ADD COLUMN is_head_office TINYINT(1) DEFAULT 0;

-- Indexes for new tables
CREATE INDEX idx_behavior_student ON behavior_logs(student_id, date);
CREATE INDEX idx_online_exam_program ON online_exams(program_id, status);
CREATE INDEX idx_exam_attempts ON exam_attempts(online_exam_id, student_id);
CREATE INDEX idx_visitor_date ON visitor_logs(institution_id, check_in);
CREATE INDEX idx_meetings_teacher ON parent_meetings(teacher_id, proposed_date);

-- =============================================
-- Revision 5 — New Feature Tables
-- =============================================

-- GPS Tracking
CREATE TABLE vehicle_locations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    speed DECIMAL(5,2),
    heading INT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vehicle_latest (vehicle_id, timestamp)
);

-- Scholarships
CREATE TABLE scholarships (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    amount DECIMAL(10,2),
    percentage DECIMAL(5,2),
    criteria TEXT,
    funded_by VARCHAR(150),
    academic_year_id BIGINT UNSIGNED,
    total_slots INT,
    available_slots INT,
    application_deadline DATE,
    status ENUM('open','closed','awarded') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scholarship_applications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    scholarship_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    reason TEXT,
    documents JSON,
    gpa DECIMAL(3,2),
    household_income VARCHAR(100),
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    awarded_amount DECIMAL(10,2) NULL,
    approved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_app (scholarship_id, student_id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Institution Events & Competitions
CREATE TABLE institution_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    type ENUM('academic','sports','cultural','religious','other') DEFAULT 'other',
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    venue VARCHAR(150),
    target_audience ENUM('all','students','teachers','parents') DEFAULT 'all',
    program_ids JSON,
    registration_required TINYINT(1) DEFAULT 0,
    registration_deadline DATE NULL,
    max_participants INT NULL,
    created_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_registrations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('registered','attended','absent') DEFAULT 'registered',
    UNIQUE KEY unique_reg (event_id, student_id)
);

CREATE TABLE event_results (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    position INT,
    award VARCHAR(100),
    points INT DEFAULT 0,
    certificate_issued TINYINT(1) DEFAULT 0
);

-- Teacher Training / CPD
CREATE TABLE training_programs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    provider VARCHAR(150),
    type ENUM('workshop','seminar','online','conference','certification') DEFAULT 'workshop',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration_hours INT,
    venue VARCHAR(150),
    cost DECIMAL(10,2) DEFAULT 0,
    funded_by ENUM('institution','teacher','external') DEFAULT 'institution',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE teacher_trainings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NULL,
    title VARCHAR(150),
    type VARCHAR(50),
    completed_date DATE,
    duration_hours INT,
    certificate_path VARCHAR(255),
    status ENUM('planned','completed','cancelled') DEFAULT 'planned',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

-- Exam Admit Card (extend exams table)
ALTER TABLE exams ADD COLUMN admit_card_available TINYINT(1) DEFAULT 0;
ALTER TABLE exams ADD COLUMN admit_card_from DATE NULL;
ALTER TABLE exams ADD COLUMN exam_center VARCHAR(150) NULL;
ALTER TABLE exams ADD COLUMN admit_card_instructions TEXT NULL;

-- Online Vehicles extend (GPS)
ALTER TABLE vehicles ADD COLUMN gps_device_id VARCHAR(50) NULL;
ALTER TABLE vehicles ADD COLUMN gps_api_key VARCHAR(100) NULL;

-- Institutions theme/branding
ALTER TABLE institutions ADD COLUMN primary_color VARCHAR(7) DEFAULT '#185FA5';
ALTER TABLE institutions ADD COLUMN secondary_color VARCHAR(7) DEFAULT '#0F6E56';
ALTER TABLE institutions ADD COLUMN accent_color VARCHAR(7) DEFAULT '#E67E22';
ALTER TABLE institutions ADD COLUMN logo_path VARCHAR(255) NULL;
ALTER TABLE institutions ADD COLUMN favicon_path VARCHAR(255) NULL;
ALTER TABLE institutions ADD COLUMN theme_mode ENUM('light','dark','auto') DEFAULT 'light';
ALTER TABLE institutions ADD COLUMN theme_updated_by BIGINT UNSIGNED NULL;
ALTER TABLE institutions ADD COLUMN theme_updated_at TIMESTAMP NULL;

-- Theme change audit (Super Admin action history)
CREATE TABLE institution_theme_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    changed_by BIGINT UNSIGNED NOT NULL,
    old_values JSON,
    new_values JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- AI usage tracking
CREATE TABLE ai_usage_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    prompt_type VARCHAR(50),
    tokens_used INT,
    response_time_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Final indexes
CREATE INDEX idx_events_date ON institution_events(institution_id, event_date);
CREATE INDEX idx_scholarships_status ON scholarships(institution_id, status);
CREATE INDEX idx_trainings_teacher ON teacher_trainings(teacher_id, status);


-- =============================================
-- Revision 6 — Multi-Institution-Type, Enrollment, Theme Presets, Custom Domains
-- Specs: docs/modules/institution-types.md, docs/THEMING.md, docs/modules/custom-domain.md
-- =============================================

-- Per-institution uniqueness for business codes
CREATE UNIQUE INDEX unique_tc_number ON tc_certificates(institution_id, tc_number);
CREATE UNIQUE INDEX unique_certificate_no ON certificates(institution_id, certificate_no);

-- Enrollment: student <-> batch (many-to-many). SOURCE OF TRUTH for membership.
CREATE TABLE enrollments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,
    academic_year_id BIGINT UNSIGNED NULL,
    roll_no INT NULL,
    optional_subject_id BIGINT UNSIGNED NULL,    -- college / class 9-10 4th subject
    fee_override DECIMAL(10,2) NULL,             -- negotiated monthly fee for this student in this batch
    is_primary TINYINT(1) DEFAULT 0,             -- exactly one active primary enrollment per student
    enrolled_at DATE NOT NULL,
    left_at DATE NULL,
    status ENUM('active','completed','dropped','transferred','promoted') DEFAULT 'active',
    note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (program_id) REFERENCES programs(id),
    FOREIGN KEY (batch_id) REFERENCES batches(id)
);
CREATE INDEX idx_enrollments_batch ON enrollments(institution_id, batch_id, status);
CREATE INDEX idx_enrollments_student ON enrollments(student_id, status);
CREATE INDEX idx_attendance_batch_date ON attendances(institution_id, batch_id, date);
CREATE INDEX idx_fee_payments_enrollment ON fee_payments(enrollment_id, month);

-- Batch <-> Teacher assignment with pay terms (coaching / private_batch)
CREATE TABLE batch_teachers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL DEFAULT 0, -- 0 = all subjects of the batch
    pay_type ENUM('salary','fixed_monthly','per_class','percentage') DEFAULT 'salary',
    pay_rate DECIMAL(10,2) DEFAULT 0,            -- BDT amount, or percent when pay_type = percentage
    UNIQUE KEY unique_batch_teacher (batch_id, teacher_id, subject_id),
    FOREIGN KEY (batch_id) REFERENCES batches(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

CREATE TABLE teacher_payouts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL DEFAULT 0,  -- 0 = not batch-specific
    month VARCHAR(7) NOT NULL,                   -- 2026-10
    classes_taken INT DEFAULT 0,
    collection_base DECIMAL(10,2) DEFAULT 0,     -- fee collected for the batch in that month
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('draft','approved','paid') DEFAULT 'draft',
    paid_at TIMESTAMP NULL,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_payout (teacher_id, batch_id, month),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

-- Admission inquiries / leads (coaching)
CREATE TABLE admission_leads (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    guardian_name VARCHAR(100) NULL,             -- R6.2: filled by the public admission form
    email VARCHAR(100) NULL,
    current_class VARCHAR(100) NULL,             -- where the applicant studies now (free text)
    message VARCHAR(500) NULL,
    interested_program_id BIGINT UNSIGNED NULL,
    interested_batch_id BIGINT UNSIGNED NULL,
    source VARCHAR(50) NULL,                     -- website, facebook, referral, walk_in, leaflet
    ip_hash CHAR(64) NULL,                       -- sha256(ip + APP_KEY) for spam control; the IP itself is never stored
    status ENUM('new','contacted','visited','enrolled','lost') DEFAULT 'new',
    follow_up_date DATE NULL,
    note TEXT NULL,
    converted_student_id BIGINT UNSIGNED NULL,
    consented_at TIMESTAMP NULL,                 -- R7: the public admission form requires the privacy consent checkbox
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_leads_phone ON admission_leads(institution_id, phone, created_at);

-- Prepaid SMS credit ledger (institutions.sms_balance is the running balance)
CREATE TABLE sms_credit_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    type ENUM('purchase','usage','adjustment','refund','qb_purchase') NOT NULL,   -- qb_purchase: D66 (1), question-bank buys from the same wallet
    quantity INT NOT NULL DEFAULT 0,             -- D56: SMS parts of a `usage` row (negative); 0 for money moves
    balance_after DECIMAL(10,2) NOT NULL,        -- D56: wallet balance in taka after this row
    reference VARCHAR(100) NULL,                 -- payment trx id / sms_logs id
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- D56-D59 (owner, 2026-10-10): the SMS wallet is money; the institution may use its own BulkSMSBD API
ALTER TABLE sms_credit_transactions ADD COLUMN amount DECIMAL(10,2) NOT NULL DEFAULT 0;   -- taka: + recharge/adjustment, - usage

-- Theme presets (global catalogue, managed by Super Admin) — see docs/THEMING.md
CREATE TABLE theme_presets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(50) UNIQUE NOT NULL,           -- classic-blue, tutor-lite ...
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    layout_key VARCHAR(30) NOT NULL DEFAULT 'sidebar-classic',
    ui_pack VARCHAR(30) NOT NULL DEFAULT 'classic',   -- R8: structural UI (component variants + page views) - docs/UI-PACKS.md; VARCHAR so a new pack needs no migration
    primary_color VARCHAR(7) NOT NULL,
    secondary_color VARCHAR(7) NOT NULL,
    accent_color VARCHAR(7) NOT NULL,
    theme_mode ENUM('light','dark','auto') DEFAULT 'light',
    tokens JSON NOT NULL,                        -- see the token schema in docs/THEMING.md
    preview_image VARCHAR(255) NULL,
    allowed_types JSON NULL,                     -- NULL = all institution types
    is_premium TINYINT(1) DEFAULT 0,             -- requires plan feature custom_branding
    is_active TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE institutions ADD COLUMN theme_preset_id BIGINT UNSIGNED NULL;
ALTER TABLE institutions ADD COLUMN layout_key VARCHAR(30) NULL;       -- NULL = use preset layout
ALTER TABLE institutions ADD COLUMN ui_pack VARCHAR(30) NULL;           -- R8: NULL = use the preset's pack (docs/UI-PACKS.md)
ALTER TABLE institutions ADD COLUMN theme_tokens JSON NULL;            -- overrides on top of preset tokens
-- D59 (owner, 2026-10-10): the institution's own BulkSMSBD API and the universal/own toggles
ALTER TABLE institutions ADD COLUMN sms_api_key TEXT NULL;                               -- D59: own BulkSMSBD key, encrypted (Laravel Crypt)
ALTER TABLE institutions ADD COLUMN sms_universal_enabled TINYINT(1) NOT NULL DEFAULT 1; -- D59 toggle: the platform's universal sender
ALTER TABLE institutions ADD COLUMN sms_own_enabled TINYINT(1) NOT NULL DEFAULT 0;       -- D59 toggle: the institution's own API + sender ID

-- Custom domains — see docs/modules/custom-domain.md
CREATE TABLE institution_domains (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    domain VARCHAR(191) NOT NULL UNIQUE,         -- lowercase, no scheme, no trailing dot
    is_primary TINYINT(1) DEFAULT 0,
    status ENUM('pending_dns','dns_verified','active','failed','disabled') DEFAULT 'pending_dns',
    verification_method ENUM('cname','a') NULL,
    check_attempts INT DEFAULT 0,
    last_checked_at TIMESTAMP NULL,
    failure_reason VARCHAR(255) NULL,
    dns_verified_at TIMESTAMP NULL,
    activated_at TIMESTAMP NULL,
    ssl_issued_at TIMESTAMP NULL,
    created_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_domains_institution ON institution_domains(institution_id, status);

-- =============================================
-- Revision 6.1 — Tables referenced by specs but previously missing
-- =============================================

-- Teacher attendance (module key: teacher_attendance) — HR & Payroll uses it for salary deduction
CREATE TABLE teacher_attendances (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    status ENUM('present','absent','late','leave') NOT NULL,
    check_in TIME NULL,
    check_out TIME NULL,
    note VARCHAR(255) NULL,
    marked_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_teacher_attendance (institution_id, teacher_id, date),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

-- Year-end archive of attendances (php artisan academic:archive). Same columns as attendances + archive info.
CREATE TABLE archived_attendances (
    id BIGINT UNSIGNED PRIMARY KEY,               -- original attendances.id (not auto-increment)
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    status ENUM('present','absent','late','leave') NOT NULL,
    note VARCHAR(255),
    taken_by BIGINT UNSIGNED,
    created_at TIMESTAMP NULL,
    academic_year_id BIGINT UNSIGNED NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_archived_att ON archived_attendances(institution_id, student_id, date);

-- =============================================
-- Revision 6.2 — Online fee payment (hybrid), settlements
-- Spec: docs/modules/online-fee-payment.md
-- NAMING: `payments` = institution pays the PLATFORM (subscription).
--         `online_payments` = a PARENT pays an institution's fee online.
-- =============================================

-- An institution's own merchant credentials. Present + active => parent money goes straight to the institution.
CREATE TABLE institution_payment_gateways (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    gateway VARCHAR(30) NOT NULL,                -- R6.4: registry key (config/payments.php 'gateways'); VARCHAR so a new gateway never needs a migration
    credentials TEXT NOT NULL,                   -- Eloquent cast 'encrypted:array'; NEVER returned by any API
    credentials_hint VARCHAR(40) NULL,           -- e.g. "…a9f2" (last 4 of the main key) shown in the UI
    is_sandbox TINYINT(1) DEFAULT 0,
    status ENUM('pending','active','failed','disabled') DEFAULT 'pending',
    last_checked_at TIMESTAMP NULL,
    last_error VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_inst_gateway (institution_id, gateway),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- Where the platform pays out money it collected on the institution's behalf. One account per institution.
CREATE TABLE institution_payout_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    method ENUM('bank','bkash','nagad') NOT NULL,
    account_name VARCHAR(150) NOT NULL,
    account_number TEXT NOT NULL,                -- encrypted cast
    bank_name VARCHAR(100) NULL,
    branch_name VARCHAR(100) NULL,
    routing_number VARCHAR(20) NULL,
    status ENUM('pending','verified','rejected') DEFAULT 'pending',   -- Super Admin verifies (changing any field resets to pending)
    verified_by BIGINT UNSIGNED NULL,
    verified_at TIMESTAMP NULL,
    reject_reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_payout_inst (institution_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- One row per parent payment attempt. Source of truth for online money movement.
CREATE TABLE online_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NULL,             -- R11: NULL for an admission-fee payment (purpose = admission_fee; lead_id is set instead)
    parent_user_id BIGINT UNSIGNED NULL,
    gateway VARCHAR(30) NOT NULL,                -- R6.4: registry key (bkash, sslcommerz, later banglaqr ...)
    channel VARCHAR(30) NULL,                    -- R6.4: how the customer actually paid (bkash, nagad, card, banglaqr ...) - reporting only
    flow VARCHAR(10) NOT NULL DEFAULT 'redirect',-- R6.4: redirect | qr | manual (reserved) - tells the UI which renderer to use
    collected_by ENUM('institution','platform') NOT NULL,   -- whose merchant account received the money
    amount DECIMAL(10,2) NOT NULL,               -- what the parent pays (computed server-side from dues, never from the client)
    gateway_fee DECIMAL(10,2) NOT NULL DEFAULT 0,   -- estimate (config percent); platform mode only
    platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0,  -- platform mode only
    net_amount DECIMAL(10,2) NOT NULL DEFAULT 0,    -- amount - gateway_fee - platform_fee (platform mode); = amount (institution mode)
    status ENUM('initiated','success','failed','cancelled','refunded','review') NOT NULL DEFAULT 'initiated',
                                                 -- review (R6.4): the gateway took money but we did NOT credit fees (amount mismatch, or paid after expiry/cancel) - needs a human
    gateway_ref VARCHAR(40) NOT NULL,            -- OUR reference, 20 chars: 'F' + 19 random base32. Sent to every gateway as invoice / tran id / QR bill number
                                                 -- (kept short: EMV QR additional-data fields are limited to ~25 chars; SSLCommerz tran_id is limited too)
    gateway_payment_id VARCHAR(100) NULL,        -- bKash paymentID / SSLCommerz session key / QR provider's order id
    qr_payload TEXT NULL,                        -- R6.4: EMV QR string for flow='qr' (so a page reload can redraw the same QR)
    expires_at TIMESTAMP NULL,                   -- R6.4: QR / session expiry; NULL = use payments.initiated_ttl_minutes
    trx_id VARCHAR(100) NULL,                    -- the gateway's transaction id after success
    items JSON NOT NULL,                         -- [{"enrollment_id":1,"fee_category_id":2,"month":"2026-10","amount":1000.00}, ...]
    receipt_no VARCHAR(50) NULL,                 -- set on success; same receipt_no on every fee_payments line
    settlement_id BIGINT UNSIGNED NULL,
    failure_reason VARCHAR(255) NULL,            -- for status=review: amount_mismatch | late_payment | duplicate
    raw_response JSON NULL,
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP NULL,
    UNIQUE KEY unique_gateway_ref (gateway_ref),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_online_pay_inst ON online_payments(institution_id, status, paid_at);
CREATE INDEX idx_online_pay_settle ON online_payments(settlement_id);
CREATE INDEX idx_online_pay_pending ON online_payments(status, initiated_at);

-- Platform pays an institution the money it collected for it (collected_by = 'platform' only).
CREATE TABLE settlements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    payments_count INT NOT NULL DEFAULT 0,
    gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gateway_fee_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    platform_fee_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_payable DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
    payout_snapshot JSON NULL,                   -- payout account (method, masked number, name) at approval time
    paid_method ENUM('bank','bkash','nagad') NULL,
    paid_reference VARCHAR(100) NULL,            -- bank transfer ref / bKash trx id
    paid_at TIMESTAMP NULL,
    note VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_settlements_inst ON settlements(institution_id, status);

-- =============================================
-- Revision 6.3 — Exam subjects: schedule + per-exam marks (fix)
-- Before: marks were fixed by subjects.full_marks (100) and an exam had no per-subject date/time, although the
-- Admit Card spec prints "Subject / Date & Time". Coaching tests (e.g. 25 marks, weekly) were impossible.
-- =============================================
CREATE TABLE exam_subjects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    full_marks DECIMAL(6,2) NOT NULL,            -- copied from subjects.full_marks at creation, editable per exam
    pass_marks DECIMAL(6,2) NOT NULL,
    exam_date DATE NULL,
    start_time TIME NULL,
    end_time TIME NULL,
    room VARCHAR(50) NULL,
    components JSON NULL,                        -- optional split, e.g. [{"key":"written","label":"সৃজনশীল","full":70,"pass":23},{"key":"mcq","label":"MCQ","full":30,"pass":10}]
    sort_order INT DEFAULT 0,
    UNIQUE KEY unique_exam_subject (exam_id, subject_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- =============================================
-- Revision 6.5 — tables that existed only inside module docs (schema.sql is the single source of truth, AGENTS.md D13)
-- =============================================
-- Report card summary (per student per exam) - docs/modules/report-cards.md
-- Written by ReportCardService::generate(): totals come from results + exam_subjects (percent-based, R6.3); positions are ranks among
-- students of the same exam (class_position = whole program, batch_position = own batch); attendance from attendances for the exam period.
CREATE TABLE report_card_summaries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    total_marks_obtained DECIMAL(8,2),
    total_full_marks DECIMAL(8,2),
    percentage DECIMAL(5,2),
    gpa DECIMAL(3,2) NULL,                       -- NULL unless settings.use_gpa
    class_position INT NULL,
    batch_position INT NULL,
    grade VARCHAR(5) NULL,
    days_present INT DEFAULT 0,
    days_absent INT DEFAULT 0,
    attendance_percentage DECIMAL(5,2) NULL,
    class_teacher_remarks TEXT NULL,
    principal_remarks TEXT NULL,
    promoted_to VARCHAR(50) NULL,
    is_published TINYINT(1) DEFAULT 0,
    published_at TIMESTAMP NULL,
    UNIQUE KEY unique_summary (student_id, exam_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (exam_id) REFERENCES exams(id)
);

-- =============================================
-- Revision 7 - consent records (children's data). See docs/legal/privacy-and-consent.md
-- One row per (student, type); history of changes is in audit_logs.
-- =============================================
CREATE TABLE consents (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(30) NOT NULL,                   -- data_processing | sms | health_data | photo
    status ENUM('granted','revoked') NOT NULL,
    guardian_name VARCHAR(100) NULL,             -- who gave it
    guardian_phone VARCHAR(20) NULL,             -- used to honour an SMS opt-out per phone number
    method ENUM('paper','portal','otp','public_form') NOT NULL,
    recorded_by BIGINT UNSIGNED NULL,            -- staff who recorded a paper consent
    granted_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    note VARCHAR(255) NULL,
    UNIQUE KEY unique_consent (student_id, type),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_consents_phone ON consents(institution_id, guardian_phone, type, status);

-- =============================================
-- Revision 10 - Full scope, part 1: advanced academics, staff & payroll
-- Specs: docs/modules/academics-advanced.md, docs/modules/staff-payroll.md
-- =============================================

-- ---------- changes to existing tables ----------
ALTER TABLE leave_applications ADD COLUMN staff_id BIGINT UNSIGNED NULL;
ALTER TABLE exam_subjects ADD COLUMN entry_deadline DATETIME NULL;
ALTER TABLE exam_subjects ADD COLUMN locked_at TIMESTAMP NULL;
ALTER TABLE exam_subjects ADD COLUMN locked_by BIGINT UNSIGNED NULL;
ALTER TABLE teachers ADD COLUMN leaving_date DATE NULL;
ALTER TABLE teacher_payouts ADD COLUMN payroll_item_id BIGINT UNSIGNED NULL;
ALTER TABLE expenses ADD COLUMN payment_method VARCHAR(30) NOT NULL DEFAULT 'cash';
ALTER TABLE expenses ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'manual';   -- manual | payroll | advance | store | refund
ALTER TABLE expenses ADD COLUMN payroll_run_id BIGINT UNSIGNED NULL;
ALTER TABLE fee_payments ADD COLUMN reverses_id BIGINT UNSIGNED NULL;      -- the original line this row reverses (docs/ROADMAP.md: refunds, finance-advanced)

-- ---------- advanced academics ----------
CREATE TABLE result_sheets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,               -- NULL = whole program
    academic_year_id BIGINT UNSIGNED NULL,
    name VARCHAR(100) NOT NULL,
    rule JSON NOT NULL,                          -- weighted components, policies (academics-advanced.md section 1.2)
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    version INT NOT NULL DEFAULT 1,
    published_at TIMESTAMP NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (program_id) REFERENCES programs(id)
);
CREATE TABLE final_results (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    result_sheet_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    total_percentage DECIMAL(5,2) NULL,
    gpa DECIMAL(3,2) NULL,
    grade VARCHAR(5) NULL,
    position_program INT NULL,
    position_batch INT NULL,
    is_pass TINYINT(1) NOT NULL DEFAULT 0,
    details JSON NOT NULL,                       -- per-subject component percentages, weighted total, grade, pass
    UNIQUE KEY unique_final_result (result_sheet_id, student_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (result_sheet_id) REFERENCES result_sheets(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE TABLE due_block_exemptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    scope VARCHAR(12) NOT NULL DEFAULT 'all',    -- admit_card | result | all
    reason VARCHAR(255) NOT NULL,
    granted_by BIGINT UNSIGNED NULL,
    expires_at DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE TABLE period_attendances (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    routine_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    status ENUM('present','absent','late','leave') NOT NULL,
    taken_by BIGINT UNSIGNED NULL,
    note VARCHAR(255) NULL,
    UNIQUE KEY unique_period_attendance (student_id, routine_id, date),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (routine_id) REFERENCES routines(id)
);
CREATE TABLE routine_blocks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NULL,             -- NULL = every program
    day_of_week ENUM('sat','sun','mon','tue','wed','thu') NULL,   -- NULL = every day
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'break',   -- break | assembly | prayer | other
    label VARCHAR(80) NULL,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE substitutions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    routine_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    original_teacher_id BIGINT UNSIGNED NOT NULL,
    substitute_teacher_id BIGINT UNSIGNED NOT NULL,
    reason VARCHAR(12) NOT NULL DEFAULT 'leave', -- leave | sick | training | other
    status ENUM('requested','confirmed','cancelled') NOT NULL DEFAULT 'requested',
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_substitution (routine_id, date),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (routine_id) REFERENCES routines(id),
    FOREIGN KEY (original_teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (substitute_teacher_id) REFERENCES teachers(id)
);
CREATE TABLE student_leave_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    total_days INT NOT NULL,
    reason VARCHAR(500) NULL,
    attachment VARCHAR(255) NULL,                -- private disk
    method VARCHAR(10) NOT NULL DEFAULT 'portal',-- portal | phone | paper
    status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    requested_by BIGINT UNSIGNED NULL,
    decided_by BIGINT UNSIGNED NULL,
    decided_at TIMESTAMP NULL,
    decision_note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- ---------- staff ----------
CREATE TABLE staff_members (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,                -- only if the person has a login (e.g. an accountant)
    employee_id VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    designation VARCHAR(80) NULL,
    department VARCHAR(80) NULL,
    phone VARCHAR(20) NULL,
    photo VARCHAR(255) NULL,
    joining_date DATE NULL,
    leaving_date DATE NULL,
    status ENUM('active','inactive','on_leave') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    UNIQUE KEY unique_staff_code (institution_id, employee_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- D101: principal-reviewed legacy profile mappings are append-only; corrections add a new row.
CREATE TABLE staff_mapping_reviews (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NULL,
    staff_member_id BIGINT UNSIGNED NULL,
    decision VARCHAR(40) NOT NULL,
    reviewed_by BIGINT UNSIGNED NOT NULL,
    reviewed_at TIMESTAMP NOT NULL,
    note VARCHAR(255) NULL,
    INDEX idx_staff_mapping_reviews_user (institution_id, user_id, reviewed_at, id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (staff_member_id) REFERENCES staff_members(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE staff_attendances (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    staff_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    status ENUM('present','absent','late','leave') NOT NULL,
    check_in TIME NULL,
    check_out TIME NULL,
    note VARCHAR(255) NULL,
    marked_by BIGINT UNSIGNED NULL,
    UNIQUE KEY unique_staff_attendance (institution_id, staff_id, date),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (staff_id) REFERENCES staff_members(id)
);

-- ---------- salary structure (effective-dated) ----------
-- payee_type ('teacher' | 'staff') + payee_id is a deliberate polymorphic pair without a FK; the service validates it and tenant scope applies.
CREATE TABLE salary_components (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(30) NOT NULL,
    name JSON NOT NULL,                          -- {"bn":"...","en":"...","ar":"..."}
    type ENUM('earning','deduction') NOT NULL,
    calc VARCHAR(20) NOT NULL DEFAULT 'fixed',   -- fixed | percent_basic
    taxable TINYINT(1) NOT NULL DEFAULT 1,
    is_pf TINYINT(1) NOT NULL DEFAULT 0,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT DEFAULT 0,
    UNIQUE KEY unique_component_code (institution_id, code),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE salary_revisions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(12) NOT NULL,                   -- initial | increment | decrement | promotion | correction
    batch_id VARCHAR(40) NULL,
    batch_label VARCHAR(100) NULL,
    change_mode VARCHAR(8) NOT NULL DEFAULT 'set',   -- percent | amount | set
    change_value DECIMAL(10,2) NULL,
    target VARCHAR(40) NOT NULL DEFAULT 'basic',     -- basic | component:<code>
    old_basic DECIMAL(10,2) NULL,
    new_basic DECIMAL(10,2) NOT NULL,
    old_gross DECIMAL(10,2) NULL,
    new_gross DECIMAL(10,2) NOT NULL,
    calculation_snapshot JSON NOT NULL,         -- D86: immutable reviewed source/result/lines/policy; sensitive, never logged
    effective_from DATE NOT NULL,
    reason VARCHAR(255) NULL,
    arrears_policy VARCHAR(8) NOT NULL DEFAULT 'auto',   -- auto | none
    status ENUM('proposed','approved','rejected','applied','cancelled') NOT NULL DEFAULT 'proposed',
    proposed_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    approved_at TIMESTAMP NULL,
    acknowledged_path VARCHAR(255) NULL,         -- payee's signed acknowledgement (decrement), private disk
    letter_no VARCHAR(30) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_revision_letter (institution_id, letter_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_revisions_payee ON salary_revisions(institution_id, payee_type, payee_id, effective_from);
CREATE TABLE salary_structures (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    basic DECIMAL(10,2) NOT NULL,
    gross DECIMAL(10,2) NOT NULL,                -- computed from the lines when the structure was created
    effective_from DATE NOT NULL,
    effective_to DATE NULL,                      -- NULL = current
    designation VARCHAR(80) NULL,
    grade VARCHAR(30) NULL,
    revision_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_structure_start (institution_id, payee_type, payee_id, effective_from),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE salary_structure_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    structure_id BIGINT UNSIGNED NOT NULL,
    component_id BIGINT UNSIGNED NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'fixed',   -- fixed | percent_basic
    value DECIMAL(10,2) NOT NULL,
    UNIQUE KEY unique_structure_component (structure_id, component_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (structure_id) REFERENCES salary_structures(id),
    FOREIGN KEY (component_id) REFERENCES salary_components(id)
);
CREATE TABLE salary_pay_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    method VARCHAR(12) NOT NULL,                 -- cash | bank | bkash | nagad | rocket | cheque
    account_name VARCHAR(120) NULL,
    account_number TEXT NULL,                    -- encrypted cast; never returned by any API (last 4 only)
    bank_name VARCHAR(100) NULL,
    branch_name VARCHAR(100) NULL,
    routing_number VARCHAR(20) NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY unique_pay_account (institution_id, payee_type, payee_id, method),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- ---------- bonus, adjustments, advances ----------
CREATE TABLE bonus_schemes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'festival',    -- festival | performance | annual | other
    pay_month VARCHAR(7) NOT NULL,
    basis VARCHAR(8) NOT NULL DEFAULT 'basic',       -- basic | gross | fixed
    value DECIMAL(10,2) NOT NULL,                    -- percent of basis, or the amount when basis = fixed
    min_service_months INT NOT NULL DEFAULT 0,
    prorate_below_months INT NOT NULL DEFAULT 0,
    applies_to JSON NULL,                            -- {payee_types, designations, exclude:[{type,id}]}
    max_amount DECIMAL(10,2) NULL,
    taxable TINYINT(1) NOT NULL DEFAULT 1,
    status ENUM('draft','applied','cancelled') NOT NULL DEFAULT 'draft',
    application_snapshot JSON NULL,                -- D87: immutable successful application source/results/policy
    applied_at TIMESTAMP NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE salary_advances (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reason VARCHAR(255) NULL,
    installments INT NOT NULL DEFAULT 1,
    installment_amount DECIMAL(10,2) NOT NULL,
    recover_from_month VARCHAR(7) NOT NULL,
    terms_snapshot JSON NOT NULL,                   -- D87: immutable reviewed terms/source/policy
    expense_id BIGINT UNSIGNED NULL,
    skipped_months JSON NULL,                       -- D87: service append-only month/reason/approver/time
    recovered DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(12) NULL,
    status ENUM('requested','approved','active','closed','rejected','written_off') NOT NULL DEFAULT 'requested',
    requested_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    disbursed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_advance_expense (institution_id, expense_id),
    FOREIGN KEY (expense_id) REFERENCES expenses(id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE salary_adjustments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(12) NOT NULL,                   -- bonus | allowance | overtime | extra_class | arrear | fine | recovery | other
    direction ENUM('earning','deduction') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,               -- always positive; direction carries the sign
    month VARCHAR(7) NOT NULL,                   -- payroll month it lands in
    taxable TINYINT(1) NOT NULL DEFAULT 1,
    scheme_id BIGINT UNSIGNED NULL,
    revision_id BIGINT UNSIGNED NULL,
    description VARCHAR(255) NULL,
    attachment VARCHAR(255) NULL,
    status ENUM('pending','approved','applied','cancelled') NOT NULL DEFAULT 'pending',
    payroll_item_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_scheme_payee (scheme_id, payee_type, payee_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_adjustments_month ON salary_adjustments(institution_id, month, status);

-- ---------- payroll ----------
CREATE TABLE payroll_runs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    month VARCHAR(7) NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'regular',     -- regular | bonus | final | supplementary
    label VARCHAR(80) NOT NULL DEFAULT '',
    status ENUM('draft','reviewed','approved','paid','cancelled') NOT NULL DEFAULT 'draft',
    settings_snapshot JSON NULL,
    payees_count INT NOT NULL DEFAULT 0,
    total_gross DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_net DECIMAL(12,2) NOT NULL DEFAULT 0,
    prepared_by BIGINT UNSIGNED NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    approved_at TIMESTAMP NULL,
    self_approved TINYINT(1) NOT NULL DEFAULT 0,
    paid_at TIMESTAMP NULL,
    cancelled_reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_payroll_run (institution_id, month, kind, label),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE payroll_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    run_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    structure_id BIGINT UNSIGNED NULL,
    days_in_month TINYINT UNSIGNED NOT NULL,
    paid_days DECIMAL(5,2) NOT NULL DEFAULT 0,
    absent_days DECIMAL(5,2) NOT NULL DEFAULT 0,
    lwp_days DECIMAL(5,2) NOT NULL DEFAULT 0,
    late_count INT NOT NULL DEFAULT 0,
    basic DECIMAL(10,2) NOT NULL DEFAULT 0,
    gross DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_earnings DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    net DECIMAL(10,2) NOT NULL DEFAULT 0,
    breakdown JSON NOT NULL,                     -- immutable snapshot after the run is approved (staff-payroll.md section 7.3)
    status ENUM('ready','held','paid','failed') NOT NULL DEFAULT 'ready',
    hold_reason VARCHAR(255) NULL,
    payment_method VARCHAR(12) NULL,
    paid_reference VARCHAR(100) NULL,
    paid_at TIMESTAMP NULL,
    paid_by BIGINT UNSIGNED NULL,
    slip_no VARCHAR(30) NULL,
    UNIQUE KEY unique_item_per_run (run_id, payee_type, payee_id),
    UNIQUE KEY unique_slip_no (institution_id, slip_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (run_id) REFERENCES payroll_runs(id)
);
CREATE INDEX idx_payroll_items_payee ON payroll_items(institution_id, payee_type, payee_id);
CREATE TABLE provident_fund_entries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    month VARCHAR(7) NOT NULL,
    kind VARCHAR(12) NOT NULL,                   -- employee | employer | withdrawal | interest | adjustment
    amount DECIMAL(10,2) NOT NULL,               -- withdrawal / negative adjustment stored negative
    payroll_item_id BIGINT UNSIGNED NULL,
    note VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_pf_payee ON provident_fund_entries(institution_id, payee_type, payee_id, month);

-- ---------- R10 verification: columns used by module specs but missing from this file (found by the doc-vs-schema parity check) ----------
ALTER TABLE visitor_logs ADD COLUMN department VARCHAR(100) NULL;
ALTER TABLE visitor_logs ADD COLUMN photo VARCHAR(255) NULL;              -- private disk (a visitor's photo is personal data; docs/legal/privacy-and-consent.md)
ALTER TABLE parent_meetings ADD COLUMN parent_response_at TIMESTAMP NULL;
ALTER TABLE alumni ADD COLUMN address TEXT NULL;
ALTER TABLE alumni ADD COLUMN profile_photo VARCHAR(255) NULL;
ALTER TABLE event_results ADD COLUMN remarks TEXT NULL;

-- =============================================
-- Revision 11 - Full scope, part 2: finance, store, devices, platform ops, public site plus, madrasa, insights, admission, migration, accounting, donations
-- Specs: docs/modules/{finance-advanced,inventory,attendance-devices,platform-ops,public-website-plus,madrasa,communication-plus,
--        documents-identity,learning-insights,admission-cycle,data-migration,accounting,donations}.md
-- Tables WITHOUT institution_id on purpose (platform level): coupons, platform_settings.
-- =============================================

-- ---------- changes to existing tables ----------
ALTER TABLE settlements ADD COLUMN refund_adjustment DECIMAL(12,2) NOT NULL DEFAULT 0;          -- refunds after a settlement was paid are deducted from the next one
ALTER TABLE online_payments ADD COLUMN refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE online_payments ADD COLUMN purpose VARCHAR(20) NOT NULL DEFAULT 'fee';              -- fee | admission_fee
ALTER TABLE online_payments ADD COLUMN lead_id BIGINT UNSIGNED NULL;
ALTER TABLE payments ADD COLUMN refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN refund_note VARCHAR(255) NULL;
ALTER TABLE subscription_invoices ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE subscription_invoices ADD COLUMN coupon_id BIGINT UNSIGNED NULL;
ALTER TABLE subscription_invoices ADD COLUMN tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE subscription_invoices ADD COLUMN tax_label VARCHAR(30) NULL;
ALTER TABLE subscription_invoices ADD COLUMN tax_inclusive TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE subscription_invoices ADD COLUMN credit_for_id BIGINT UNSIGNED NULL;               -- a credit note points at the invoice it reduces
ALTER TABLE teachers ADD COLUMN show_public TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN public_bio TEXT NULL;
ALTER TABLE teachers ADD COLUMN mpo_index_no VARCHAR(30) NULL;      -- OPTIONAL (D44): shown only when institutions.settings.ownership is 'mpo' or 'government'
ALTER TABLE institution_events ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN name_alt VARCHAR(150) NULL;                                        -- second-language name (e.g. Arabic) printed on marksheets / IDs
ALTER TABLE users ADD COLUMN ui_preferences JSON NULL;                                          -- font_scale, high_contrast, dyslexia_font, reduced_motion
ALTER TABLE subjects ADD COLUMN name_alt VARCHAR(150) NULL;
ALTER TABLE programs ADD COLUMN name_alt VARCHAR(150) NULL;
ALTER TABLE batches ADD COLUMN name_alt VARCHAR(150) NULL;
ALTER TABLE batches ADD COLUMN shift VARCHAR(10) NULL;                                          -- morning | day | evening (NULL = single shift)
ALTER TABLE expenses ADD COLUMN fund_id BIGINT UNSIGNED NULL;                                   -- spending out of a restricted donation fund
ALTER TABLE certificates ADD COLUMN verify_code VARCHAR(16) NULL;
ALTER TABLE tc_certificates ADD COLUMN verify_code VARCHAR(16) NULL;
ALTER TABLE notices ADD COLUMN require_ack TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE notices ADD COLUMN ack_deadline DATE NULL;
ALTER TABLE sms_logs ADD COLUMN campaign_id BIGINT UNSIGNED NULL;
ALTER TABLE sms_logs ADD COLUMN gateway_msg_id VARCHAR(60) NULL;
ALTER TABLE sms_logs ADD COLUMN delivery_status VARCHAR(12) NULL;                               -- NULL = unknown | delivered | undelivered | expired
ALTER TABLE sms_logs ADD COLUMN delivered_at TIMESTAMP NULL;
-- D56/D59 (owner, 2026-10-10): what the SMS cost and which API sent it
ALTER TABLE sms_logs ADD COLUMN cost DECIMAL(8,2) NOT NULL DEFAULT 0;                    -- taka charged (0 on the institution's own API)
ALTER TABLE sms_logs ADD COLUMN route VARCHAR(10) NOT NULL DEFAULT 'universal';         -- universal | own
ALTER TABLE admission_leads ADD COLUMN cycle_id BIGINT UNSIGNED NULL;
ALTER TABLE admission_leads ADD COLUMN test_roll VARCHAR(20) NULL;
ALTER TABLE admission_leads ADD COLUMN test_marks DECIMAL(6,2) NULL;
ALTER TABLE admission_leads ADD COLUMN merit_rank INT NULL;
ALTER TABLE admission_leads ADD COLUMN list_status VARCHAR(12) NULL;                            -- selected | waiting | rejected | admitted | declined

-- ---------- finance: cash book, refunds ----------
CREATE TABLE cash_book_closings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    revision INT UNSIGNED NOT NULL,
    opening_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    cash_in DECIMAL(12,2) NOT NULL DEFAULT 0,
    cash_out DECIMAL(12,2) NOT NULL DEFAULT 0,
    expected_closing DECIMAL(12,2) NOT NULL DEFAULT 0,
    counted_cash DECIMAL(12,2) NULL,
    difference DECIMAL(12,2) NULL,
    status ENUM('closed','reopened') NOT NULL DEFAULT 'closed',
    note VARCHAR(255) NULL,
    closed_by BIGINT UNSIGNED NULL,
    closed_at TIMESTAMP NULL,
    reopened_by BIGINT UNSIGNED NULL,
    reopened_at TIMESTAMP NULL,
    reopen_reason VARCHAR(255) NULL,
    UNIQUE KEY unique_cash_day_revision (institution_id, date, revision),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
-- D84: tenant-bound refund snapshots; original request row is revision 1.
CREATE UNIQUE INDEX unique_students_inst_id ON students(institution_id, id);
CREATE TABLE fee_refunds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    request_key CHAR(36) NOT NULL,
    revision INT UNSIGNED NOT NULL,                         -- starts at 1; transitions append the next revision
    original_receipt_no VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    refund_lines JSON NOT NULL,                          -- [{fee_payment_id, amount}] - which receipt lines are reversed
    reason VARCHAR(255) NOT NULL,
    method VARCHAR(16) NOT NULL DEFAULT 'cash',   -- cash | bank | bkash | nagad | online_gateway
    online_payment_id BIGINT UNSIGNED NULL,
    gateway_refund_ref VARCHAR(100) NULL,
    status ENUM('requested','approved','processed','rejected') NOT NULL DEFAULT 'requested',
    reversal_receipt_no VARCHAR(50) NULL,
    requested_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    processed_by BIGINT UNSIGNED NULL,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    UNIQUE KEY unique_fee_refund_revision (institution_id, request_key, revision),
    CONSTRAINT fk_fee_refunds_student FOREIGN KEY (institution_id, student_id) REFERENCES students(institution_id, id)
);

-- ---------- store / inventory ----------
CREATE TABLE inventory_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(60) NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    sale_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    avg_cost DECIMAL(10,2) NOT NULL DEFAULT 0,    -- moving average, maintained by InventoryService
    reorder_level DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock DECIMAL(12,2) NOT NULL DEFAULT 0,       -- CACHE of the movement ledger; only InventoryService writes it
    is_sellable TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    deleted_at TIMESTAMP NULL,
    UNIQUE KEY unique_item_code (institution_id, code),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE inventory_movements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    type ENUM('receive','issue','sale','return','adjust','damage') NOT NULL,
    qty DECIMAL(12,2) NOT NULL,                   -- always positive; `direction` (+1/-1) gives the sign
    direction TINYINT NOT NULL,                   -- +1 adds stock, -1 removes
    unit_amount DECIMAL(10,2) NOT NULL DEFAULT 0, -- receive: unit cost; sale: unit price
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    balance_after DECIMAL(12,2) NOT NULL,
    student_id BIGINT UNSIGNED NULL,
    issued_to_type VARCHAR(10) NULL,              -- student | teacher | staff | department
    issued_to_id BIGINT UNSIGNED NULL,
    supplier VARCHAR(100) NULL,
    receipt_no VARCHAR(30) NULL,                  -- sales only (prefix STR-)
    payment_method VARCHAR(16) NULL,
    reference VARCHAR(100) NULL,
    note VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_store_receipt (institution_id, receipt_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);
CREATE INDEX idx_inventory_item ON inventory_movements(institution_id, item_id, created_at);

-- ---------- attendance devices ----------
CREATE TABLE attendance_devices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'generic',  -- generic | rfid | fingerprint | face | qr
    location VARCHAR(100) NULL,
    key_id VARCHAR(24) NOT NULL,
    secret TEXT NOT NULL,                         -- encrypted cast; shown once at creation
    utc_offset_minutes INT NOT NULL DEFAULT 360,  -- the device's local clock vs UTC (Bangladesh = +360)
    status ENUM('active','disabled') NOT NULL DEFAULT 'active',
    last_seen_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_device_key (key_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE person_credentials (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    person_type VARCHAR(10) NOT NULL,             -- student | teacher | staff
    person_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(12) NOT NULL,                    -- rfid | device_user | qr   (a card UID or the ID a device holds; NEVER a biometric template)
    value VARCHAR(64) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_credential (institution_id, kind, value),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE device_punches (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    device_id BIGINT UNSIGNED NOT NULL,
    credential_value VARCHAR(64) NOT NULL,
    punched_at DATETIME NOT NULL,                 -- UTC
    direction VARCHAR(4) NOT NULL DEFAULT 'auto', -- in | out | auto
    raw JSON NULL,
    status ENUM('pending','matched','unmatched','duplicate','processed','ignored') NOT NULL DEFAULT 'pending',
    person_type VARCHAR(10) NULL,
    person_id BIGINT UNSIGNED NULL,
    processed_at TIMESTAMP NULL,
    UNIQUE KEY unique_punch (device_id, credential_value, punched_at),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (device_id) REFERENCES attendance_devices(id)
);
CREATE INDEX idx_punches_status ON device_punches(institution_id, status, punched_at);

-- ---------- platform operations ----------
CREATE TABLE support_tickets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    ticket_no VARCHAR(20) NOT NULL,               -- platform-issued, globally unique: TKT-2027-00001
    subject VARCHAR(150) NOT NULL,
    category VARCHAR(20) NOT NULL DEFAULT 'general',   -- general | billing | bug | how_to | feature | sms | payment | domain
    priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
    status ENUM('open','pending_customer','pending_platform','resolved','closed') NOT NULL DEFAULT 'open',
    created_by BIGINT UNSIGNED NOT NULL,
    assigned_to BIGINT UNSIGNED NULL,
    first_response_due_at TIMESTAMP NULL,
    first_responded_at TIMESTAMP NULL,
    resolved_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    rating TINYINT NULL,
    rating_note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_ticket_no (ticket_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE support_ticket_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    ticket_id BIGINT UNSIGNED NOT NULL,
    author_type VARCHAR(10) NOT NULL,             -- institution | platform
    author_id BIGINT UNSIGNED NOT NULL,
    body TEXT NOT NULL,
    is_internal TINYINT(1) NOT NULL DEFAULT 0,    -- platform-only note, never shown to the institution
    attachments JSON NULL,                        -- private disk paths
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);
CREATE TABLE coupons (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL,
    type ENUM('percent','fixed','free_days') NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    max_discount DECIMAL(10,2) NULL,              -- cap for percent coupons
    applies_to_plans JSON NULL,
    applies_to_types JSON NULL,
    min_amount DECIMAL(10,2) NULL,
    valid_from DATE NULL,
    valid_until DATE NULL,
    max_redemptions INT NULL,
    per_institution_limit INT NOT NULL DEFAULT 1,
    redeemed_count INT NOT NULL DEFAULT 0,
    status ENUM('draft','active','paused','expired') NOT NULL DEFAULT 'draft',
    note VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_coupon_code (code)
);
CREATE TABLE coupon_redemptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    coupon_id BIGINT UNSIGNED NOT NULL,
    payment_id BIGINT UNSIGNED NULL,
    invoice_id BIGINT UNSIGNED NULL,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    free_days INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (coupon_id) REFERENCES coupons(id)
);
CREATE TABLE platform_settings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(80) NOT NULL,
    value JSON NOT NULL,
    updated_by BIGINT UNSIGNED NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_setting_key (setting_key)
);
CREATE TABLE impersonation_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    super_admin_id BIGINT UNSIGNED NOT NULL,
    target_user_id BIGINT UNSIGNED NOT NULL,
    reason VARCHAR(255) NOT NULL,
    mode ENUM('read_only','full') NOT NULL DEFAULT 'read_only',
    code_hash CHAR(64) NULL,                      -- one-time exchange code, stored hashed
    code_expires_at TIMESTAMP NULL,
    status ENUM('pending','active','ended','expired') NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP NULL,
    ended_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    token_id BIGINT UNSIGNED NULL,
    ip_hash CHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE tenant_exports (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(10) NOT NULL DEFAULT 'export',   -- export | backup
    status ENUM('queued','running','ready','failed','expired') NOT NULL DEFAULT 'queued',
    format_version INT NOT NULL DEFAULT 1,
    include_secrets TINYINT(1) NOT NULL DEFAULT 0,
    tables_count INT NOT NULL DEFAULT 0,
    rows_count BIGINT NOT NULL DEFAULT 0,
    file_path VARCHAR(255) NULL,
    size_bytes BIGINT NULL,
    checksum CHAR(64) NULL,
    requested_by BIGINT UNSIGNED NULL,
    error VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- ---------- public site plus ----------
CREATE TABLE gallery_albums (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description VARCHAR(500) NULL,
    event_id BIGINT UNSIGNED NULL,
    is_public TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE gallery_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    album_id BIGINT UNSIGNED NOT NULL,
    file_path VARCHAR(255) NOT NULL,              -- public disk; only images with no identifiable minors unless consent photo is granted
    caption VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (album_id) REFERENCES gallery_albums(id)
);
CREATE TABLE site_posts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    type ENUM('news','page') NOT NULL,
    title VARCHAR(150) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    body_md TEXT NOT NULL,                        -- restricted Markdown, rendered server-side and sanitised; never raw HTML
    cover VARCHAR(255) NULL,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    published_at TIMESTAMP NULL,
    show_in_menu TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_post_slug (institution_id, type, slug),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE lead_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    lead_id BIGINT UNSIGNED NOT NULL,
    online_payment_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    receipt_no VARCHAR(30) NOT NULL,              -- prefix APP-
    paid_at TIMESTAMP NULL,
    UNIQUE KEY unique_lead_receipt (institution_id, receipt_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (lead_id) REFERENCES admission_leads(id)
);

-- ---------- madrasa ----------
CREATE TABLE hifz_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NULL,
    record_date DATE NOT NULL,
    kind VARCHAR(8) NOT NULL,                     -- sabaq (new lesson) | sabqi (recent revision) | manzil (older revision)
    from_surah SMALLINT NOT NULL,
    from_ayah SMALLINT NOT NULL,
    to_surah SMALLINT NOT NULL,
    to_ayah SMALLINT NOT NULL,
    para_no TINYINT NULL,                         -- 1..30 when the portion is a whole para
    pages DECIMAL(4,1) NULL,
    quality TINYINT NULL,                         -- 1 (weak) .. 5 (excellent)
    mistakes INT NULL,
    remarks VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_hifz_student ON hifz_records(institution_id, student_id, record_date);

-- ---------- insights: syllabus, risk ----------
CREATE TABLE syllabus_units (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    title VARCHAR(200) NOT NULL,
    term VARCHAR(20) NULL,
    planned_periods INT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (program_id) REFERENCES programs(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);
CREATE TABLE lesson_plans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    unit_id BIGINT UNSIGNED NULL,
    planned_date DATE NOT NULL,
    objective TEXT NULL,
    activities TEXT NULL,
    resources TEXT NULL,
    status ENUM('planned','taught','skipped') NOT NULL DEFAULT 'planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);
CREATE TABLE syllabus_coverage (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,
    unit_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    covered_on DATE NOT NULL,
    note VARCHAR(255) NULL,
    UNIQUE KEY unique_unit_coverage (batch_id, unit_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (unit_id) REFERENCES syllabus_units(id)
);
CREATE TABLE risk_flags (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,
    kind VARCHAR(12) NOT NULL,                    -- attendance | marks_drop | dues | combined
    level ENUM('watch','high') NOT NULL,
    score DECIMAL(5,2) NOT NULL DEFAULT 0,
    details JSON NOT NULL,
    status ENUM('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
    computed_on DATE NOT NULL,
    acknowledged_by BIGINT UNSIGNED NULL,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_risk_flag (student_id, kind, computed_on),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- ---------- admission cycle ----------
CREATE TABLE admission_cycles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    academic_year_id BIGINT UNSIGNED NULL,
    seats INT NOT NULL,
    apply_from DATE NOT NULL,
    apply_until DATE NOT NULL,
    test_date DATE NULL,
    application_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    status ENUM('draft','open','testing','listing','closed') NOT NULL DEFAULT 'draft',
    rule JSON NOT NULL,                           -- merit formula, waiting size, quotas, lottery on/off
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (program_id) REFERENCES programs(id)
);
CREATE TABLE admission_draws (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    cycle_id BIGINT UNSIGNED NOT NULL,
    seed_commitment CHAR(64) NOT NULL,            -- sha256(seed), published BEFORE the draw
    seed_reveal VARCHAR(64) NULL,                 -- revealed at the draw; anyone can re-run the order
    applicants_count INT NULL,
    result JSON NULL,
    drawn_by BIGINT UNSIGNED NULL,
    drawn_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_cycle_draw (cycle_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (cycle_id) REFERENCES admission_cycles(id)
);

-- ---------- data migration ----------
CREATE TABLE import_jobs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(16) NOT NULL,                    -- students | teachers | staff | fee_history | results | attendance
    status ENUM('uploaded','mapped','dry_run','running','done','failed','rolled_back') NOT NULL DEFAULT 'uploaded',
    file_path VARCHAR(255) NOT NULL,
    mapping JSON NULL,
    summary JSON NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE import_rows (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    job_id BIGINT UNSIGNED NOT NULL,
    row_no INT NOT NULL,
    status ENUM('ok','error','skipped') NOT NULL,
    error VARCHAR(255) NULL,
    data JSON NULL,
    created_table VARCHAR(40) NULL,               -- what this row created, so a rollback can remove exactly that
    created_id BIGINT UNSIGNED NULL,
    UNIQUE KEY unique_import_row (job_id, row_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (job_id) REFERENCES import_jobs(id)
);

-- ---------- communication plus ----------
CREATE TABLE notice_receipts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    notice_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    read_at TIMESTAMP NULL,
    acknowledged_at TIMESTAMP NULL,
    UNIQUE KEY unique_notice_receipt (notice_id, user_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (notice_id) REFERENCES notices(id)
);
CREATE TABLE sms_templates (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(14) NOT NULL DEFAULT 'transactional',   -- transactional | promotional | emergency
    body JSON NOT NULL,                           -- {"bn":"...","en":"...","ar":"..."} with {placeholders}
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY unique_sms_template (institution_id, code),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE sms_campaigns (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(10) NOT NULL DEFAULT 'campaign',  -- campaign | emergency | reminder
    title VARCHAR(120) NOT NULL,
    template_id BIGINT UNSIGNED NULL,
    body TEXT NOT NULL,
    audience JSON NOT NULL,                       -- {"type":"batch|program|all_parents|dues|custom", "ids":[...]}
    status ENUM('draft','scheduled','sending','done','cancelled') NOT NULL DEFAULT 'draft',
    scheduled_at TIMESTAMP NULL,
    total_recipients INT NOT NULL DEFAULT 0,
    sent_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    segments_total INT NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- ---------- accounting ----------
CREATE TABLE ledger_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(120) NOT NULL,
    type ENUM('asset','liability','equity','income','expense') NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    is_cash_or_bank TINYINT(1) NOT NULL DEFAULT 0,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY unique_account_code (institution_id, code),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE vouchers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    voucher_no VARCHAR(30) NOT NULL,
    type ENUM('receipt','payment','journal','contra') NOT NULL,
    date DATE NOT NULL,
    narration VARCHAR(255) NULL,
    source VARCHAR(12) NOT NULL DEFAULT 'manual',   -- manual | fee | expense | payroll | donation | store | refund
    source_id BIGINT UNSIGNED NULL,
    status ENUM('draft','posted','reversed') NOT NULL DEFAULT 'draft',
    reverses_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NULL,
    posted_by BIGINT UNSIGNED NULL,
    posted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_voucher_no (institution_id, voucher_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_voucher_source ON vouchers(institution_id, source, source_id);
CREATE TABLE voucher_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    voucher_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    debit DECIMAL(12,2) NOT NULL DEFAULT 0,
    credit DECIMAL(12,2) NOT NULL DEFAULT 0,
    memo VARCHAR(255) NULL,
    reconciled_at TIMESTAMP NULL,
    reconciled_ref VARCHAR(50) NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
    FOREIGN KEY (account_id) REFERENCES ledger_accounts(id)
);
CREATE INDEX idx_voucher_lines_account ON voucher_lines(institution_id, account_id);
CREATE TABLE budgets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    fiscal_year VARCHAR(9) NOT NULL,                -- 2027 or 2026-2027
    status ENUM('draft','approved','closed') NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_budget (institution_id, name, fiscal_year),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE budget_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    budget_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    UNIQUE KEY unique_budget_line (budget_id, account_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (budget_id) REFERENCES budgets(id),
    FOREIGN KEY (account_id) REFERENCES ledger_accounts(id)
);

-- ---------- donations ----------
CREATE TABLE donors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(20) NULL,
    address VARCHAR(255) NULL,
    type VARCHAR(12) NOT NULL DEFAULT 'individual',  -- individual | organization
    note VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    UNIQUE KEY unique_donor_phone (institution_id, phone),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE donation_funds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'general',     -- general | zakat | sadaqah | waqf | project | other
    restricted TINYINT(1) NOT NULL DEFAULT 0,        -- may only be spent for its stated purpose
    description VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY unique_fund_name (institution_id, name),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE donation_campaigns (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    fund_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    goal_amount DECIMAL(12,2) NULL,
    starts_on DATE NULL,
    ends_on DATE NULL,
    status ENUM('draft','active','closed') NOT NULL DEFAULT 'draft',
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (fund_id) REFERENCES donation_funds(id)
);
CREATE TABLE donations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    donor_id BIGINT UNSIGNED NULL,                   -- NULL = anonymous
    fund_id BIGINT UNSIGNED NOT NULL,
    campaign_id BIGINT UNSIGNED NULL,
    amount DECIMAL(12,2) NOT NULL,
    method VARCHAR(16) NOT NULL DEFAULT 'cash',
    received_on DATE NOT NULL,
    receipt_no VARCHAR(30) NOT NULL,                 -- prefix DON-
    purpose_note VARCHAR(255) NULL,
    status ENUM('received','reversed') NOT NULL DEFAULT 'received',
    reverses_id BIGINT UNSIGNED NULL,
    received_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_donation_receipt (institution_id, receipt_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (fund_id) REFERENCES donation_funds(id)
);

-- ---------- R12: columns/indexes found necessary while writing the remaining Revision 11 specs ----------
ALTER TABLE admission_leads ADD COLUMN application_no VARCHAR(20) NULL;       -- random, unguessable (A27-7K3QF); the lottery hashes THIS, never the sequential id (docs/modules/admission-cycle.md)
CREATE UNIQUE INDEX uq_lead_application_no ON admission_leads(institution_id, application_no);
ALTER TABLE certificates ADD COLUMN revoked_at TIMESTAMP NULL;                 -- the public verify page shows 'revoked' instead of deleting the code
ALTER TABLE tc_certificates ADD COLUMN revoked_at TIMESTAMP NULL;
ALTER TABLE routine_blocks ADD COLUMN shift VARCHAR(10) NULL;                  -- NULL = every shift
CREATE UNIQUE INDEX uq_voucher_source ON vouchers(institution_id, source, source_id);   -- an automatic voucher is posted once per source record (manual vouchers have NULL source_id)
CREATE UNIQUE INDEX uq_cert_verify ON certificates(institution_id, verify_code);          -- NULLs are distinct: old certificates without a code are allowed
CREATE UNIQUE INDEX uq_tc_verify ON tc_certificates(institution_id, verify_code);

-- =============================================
-- R14 performance: indexes for the hot-query catalogue (infra/scripts/hot-queries.tsv). Each one answers a named query; plan_check.py proves the planner can use it.
-- Write cost is real (every index slows INSERT): the insert-heavy tables sms_logs / audit_logs get exactly two each, fee_payments two more. Do not add speculative indexes -
-- add the query to hot-queries.tsv first. (InnoDB also builds an index for every FOREIGN KEY column, so FK columns need no extra index.)
-- =============================================
CREATE INDEX idx_sms_logs_inst_sent ON sms_logs(institution_id, sent_at);                 -- sms_log_page
CREATE INDEX idx_sms_logs_campaign ON sms_logs(campaign_id);                              -- sms_campaign_report
CREATE INDEX idx_audit_inst_created ON audit_logs(institution_id, created_at);            -- audit_page
CREATE INDEX idx_audit_model ON audit_logs(model, model_id, created_at);                -- audit_record_history (ORDER BY created_at DESC needs the date IN the index)
CREATE INDEX idx_expenses_inst_date ON expenses(institution_id, expense_date);            -- expenses_month, cash book
CREATE INDEX idx_messages_to ON messages(to_user_id, created_at);                         -- message_inbox, message_unread_count
CREATE INDEX idx_messages_from ON messages(from_user_id, created_at);                    -- sent box
CREATE INDEX idx_homeworks_audience ON homeworks(institution_id, program_id, batch_id);   -- homework_for_batch
CREATE INDEX idx_homeworks_teacher ON homeworks(teacher_id, created_at);                  -- homework_by_teacher
CREATE INDEX idx_materials_audience ON class_materials(institution_id, program_id, batch_id);   -- materials_for_batch
CREATE INDEX idx_materials_teacher ON class_materials(teacher_id, created_at);            -- materials_by_teacher
CREATE INDEX idx_ai_usage_inst_created ON ai_usage_logs(institution_id, created_at);      -- ai_quota_month
CREATE INDEX idx_leave_inst_status ON leave_applications(institution_id, status);
CREATE INDEX idx_leave_balance_actor ON leave_applications(institution_id, user_id, leave_type_id, status, from_date);         -- leave_pending
CREATE INDEX idx_payouts_inst_month ON teacher_payouts(institution_id, month);            -- payouts_month
CREATE INDEX idx_waivers_inst_status ON fee_waivers(institution_id, status);              -- waivers_pending
CREATE INDEX idx_alumni_inst_year ON alumni(institution_id, graduation_year);             -- alumni_by_year
CREATE INDEX idx_vehicles_inst ON vehicles(institution_id);                               -- vehicle_list
CREATE INDEX idx_hostels_inst ON hostels(institution_id);                                 -- (config table, no FK -> would have NO index at all)
CREATE INDEX idx_leave_types_inst ON leave_types(institution_id);
CREATE INDEX idx_training_programs_inst ON training_programs(institution_id);
CREATE INDEX idx_event_results_event ON event_results(event_id);
CREATE INDEX idx_fee_structures_batch ON fee_structures(batch_id, fee_category_id, academic_year_id);   -- fee_structure_by_batch: THE hottest fee query (FeeService::resolveAmount); the unique key leads with program_id
CREATE INDEX idx_fee_payments_inst_paid ON fee_payments(institution_id, paid_at);         -- cash_collection_day, cash book, dashboards
CREATE INDEX idx_fee_payments_student_paid ON fee_payments(student_id, paid_at);          -- student_fee_history (ORDER BY paid_at DESC LIMIT 20)
CREATE INDEX idx_notices_inst_pub ON notices(institution_id, published_at);               -- notice_page
CREATE INDEX idx_vouchers_inst_date ON vouchers(institution_id, date);                    -- voucher_ledger_period
CREATE INDEX idx_sms_credit_inst_created ON sms_credit_transactions(institution_id, created_at);   -- sms_credit_ledger
-- R15: indexes for the retention jobs (leads:purge, imports:prune) - they run per institution, so the date range must be inside an (institution_id, ...) index
CREATE INDEX idx_leads_inst_created ON admission_leads(institution_id, created_at);            -- retention_leads_purge, leads list ORDER BY created_at
CREATE INDEX idx_import_jobs_inst_created ON import_jobs(institution_id, created_at);         -- retention_imports_prune

-- =====================================================================================================================================
-- Question bank and quizzes (D65/D66, docs/modules/question-bank.md §3; Task QB.0). Prefix qb_ (no clash with subjects/exams/institutions).
-- PLATFORM catalogue (no institution_id): curriculum, question types, questions, concepts, resources, prices, rules, quizzes, writers.
-- INSTITUTION data (institution_id, BelongsToInstitution): unlocks, student orders/unlocks/package access/attempts, papers.
-- =====================================================================================================================================
CREATE TABLE qb_class_levels (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name_bn VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    education_level ENUM('primary','secondary','higher_secondary','madrasa','technical','admission','other') NOT NULL DEFAULT 'other',
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);
CREATE TABLE qb_subjects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name_bn VARCHAR(150) NOT NULL,
    name_en VARCHAR(150) NOT NULL,
    code VARCHAR(30) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);
CREATE TABLE qb_class_level_subject (
    qb_class_level_id BIGINT UNSIGNED NOT NULL,
    qb_subject_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (qb_class_level_id, qb_subject_id),
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);
CREATE TABLE qb_chapters (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_subject_id BIGINT UNSIGNED NOT NULL,
    name_bn VARCHAR(200) NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    number SMALLINT UNSIGNED NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);
CREATE TABLE qb_chapter_class_level (
    qb_chapter_id BIGINT UNSIGNED NOT NULL,
    qb_class_level_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (qb_chapter_id, qb_class_level_id),
    FOREIGN KEY (qb_chapter_id) REFERENCES qb_chapters(id),
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id)
);
CREATE TABLE qb_topics (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_chapter_id BIGINT UNSIGNED NOT NULL,
    name_bn VARCHAR(200) NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (qb_chapter_id) REFERENCES qb_chapters(id)
);
ALTER TABLE programs ADD COLUMN qb_class_level_id BIGINT UNSIGNED NULL;   -- D65: the institution's class ↔ the platform curriculum (students see their class first)

CREATE TABLE qb_question_types (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(100) NOT NULL,
    name_bn VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    family ENUM('mcq','creative','short','fill_gap','matching','true_false','ordering','writing','other') NOT NULL DEFAULT 'other',
    ui_config JSON NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_question_type_slug (slug)
);
CREATE TABLE qb_questions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_type_id BIGINT UNSIGNED NOT NULL,
    qb_subject_id BIGINT UNSIGNED NOT NULL,
    qb_chapter_id BIGINT UNSIGNED NULL,
    qb_topic_id BIGINT UNSIGNED NULL,
    difficulty TINYINT UNSIGNED NOT NULL DEFAULT 3,      -- 1 (easy) .. 5 (hard)
    marks DECIMAL(5,2) NOT NULL DEFAULT 1,
    language ENUM('bn','en','und') NOT NULL DEFAULT 'und',
    content_mode ENUM('plain_text','rich_math','mixed') NOT NULL DEFAULT 'mixed',
    question_json JSON NULL,
    question_text TEXT NOT NULL,
    answer_json JSON NULL,
    answer_text TEXT NULL,
    explanation_json JSON NULL,
    explanation_text TEXT NULL,
    status ENUM('draft','review','published','rejected') NOT NULL DEFAULT 'draft',
    review_note VARCHAR(500) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    published_at TIMESTAMP NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_qb_questions_browse (status, qb_subject_id, qb_chapter_id, qb_topic_id),
    INDEX idx_qb_questions_writer (created_by, status),
    FOREIGN KEY (qb_question_type_id) REFERENCES qb_question_types(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id),
    FOREIGN KEY (qb_chapter_id) REFERENCES qb_chapters(id),
    FOREIGN KEY (qb_topic_id) REFERENCES qb_topics(id)
);
CREATE TABLE qb_question_options (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(10) NOT NULL,
    content_json JSON NULL,
    content_text TEXT NOT NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,               -- never sent without an unlock (question-bank.md §2)
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);
CREATE TABLE qb_creative_parts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    part_label VARCHAR(10) NOT NULL,                         -- ক / খ / গ / ঘ
    cognitive_level ENUM('knowledge','understanding','application','higher_order') NOT NULL,
    marks DECIMAL(5,2) NOT NULL,
    question_json JSON NULL,
    question_text TEXT NOT NULL,
    answer_json JSON NULL,
    answer_text TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);
CREATE TABLE qb_question_stimuli (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(50) NULL,                                  -- a passage, a table, a word box (structured types, QB.4)
    content_json JSON NULL,
    content_text TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);
CREATE TABLE qb_question_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    qb_question_stimulus_id BIGINT UNSIGNED NULL,
    item_type VARCHAR(50) NOT NULL,                          -- gap / match_pair / order_step / ... (qbank's structured model)
    prompt_json JSON NULL,
    prompt_text TEXT NULL,
    answer_json JSON NULL,                                   -- never sent without an unlock
    marks DECIMAL(5,2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id),
    FOREIGN KEY (qb_question_stimulus_id) REFERENCES qb_question_stimuli(id)
);
CREATE TABLE qb_question_class_level (
    qb_question_id BIGINT UNSIGNED NOT NULL,
    qb_class_level_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (qb_question_id, qb_class_level_id),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id),
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id)
);
CREATE TABLE qb_question_occurrences (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    board VARCHAR(50) NULL,
    institution_name VARCHAR(200) NULL,
    exam_type VARCHAR(50) NULL,
    question_number VARCHAR(30) NULL,
    set_label VARCHAR(30) NULL,
    year SMALLINT UNSIGNED NULL,
    note VARCHAR(200) NULL,
    page_reference VARCHAR(100) NULL,
    INDEX idx_qb_occurrence_board_year (board, year),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);
CREATE TABLE qb_question_revisions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    snapshot JSON NOT NULL,
    edited_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);
CREATE TABLE qb_media (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    path VARCHAR(500) NOT NULL,                              -- the platform's private disk (platform/qb/...)
    mime VARCHAR(100) NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,
    uploaded_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL
);
CREATE TABLE qb_media_links (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_media_id BIGINT UNSIGNED NOT NULL,
    owner_type VARCHAR(50) NOT NULL,                         -- question / option / creative_part / concept / resource
    owner_id BIGINT UNSIGNED NOT NULL,
    INDEX idx_qb_media_owner (owner_type, owner_id),
    FOREIGN KEY (qb_media_id) REFERENCES qb_media(id)
);

CREATE TABLE qb_concepts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_topic_id BIGINT UNSIGNED NOT NULL,
    title_bn VARCHAR(250) NOT NULL,
    title_en VARCHAR(250) NULL,
    body_json JSON NULL,
    body_text MEDIUMTEXT NOT NULL,
    status ENUM('draft','review','published','rejected') NOT NULL DEFAULT 'draft',
    review_note VARCHAR(500) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_qb_concepts_topic (qb_topic_id, status),
    FOREIGN KEY (qb_topic_id) REFERENCES qb_topics(id)
);
CREATE TABLE qb_resources (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind ENUM('slide','book','pdf') NOT NULL,
    title_bn VARCHAR(250) NOT NULL,
    title_en VARCHAR(250) NULL,
    qb_subject_id BIGINT UNSIGNED NULL,
    qb_chapter_id BIGINT UNSIGNED NULL,
    qb_topic_id BIGINT UNSIGNED NULL,
    qb_media_id BIGINT UNSIGNED NOT NULL,
    page_count INT UNSIGNED NULL,
    status ENUM('draft','review','published','rejected') NOT NULL DEFAULT 'draft',
    review_note VARCHAR(500) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_qb_resources_scope (status, qb_subject_id, qb_chapter_id, qb_topic_id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id),
    FOREIGN KEY (qb_chapter_id) REFERENCES qb_chapters(id),
    FOREIGN KEY (qb_topic_id) REFERENCES qb_topics(id),
    FOREIGN KEY (qb_media_id) REFERENCES qb_media(id)
);

CREATE TABLE qb_prices (                                     -- a change is a NEW row (effective_from); old purchases keep their price
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    audience ENUM('institution','student') NOT NULL,
    item_kind ENUM('question_answer','concept','resource_slide','resource_book','resource_pdf','quiz_package') NOT NULL,
    qb_question_type_id BIGINT UNSIGNED NULL,                -- question_answer: per question type
    amount DECIMAL(10,2) NOT NULL,
    effective_from TIMESTAMP NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_prices_lookup (audience, item_kind, qb_question_type_id, effective_from),
    FOREIGN KEY (qb_question_type_id) REFERENCES qb_question_types(id)
);
CREATE TABLE qb_price_rules (                                -- question-bank.md §4.3: every free / partly-free / discount method
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_type ENUM('item','question_type','topic','chapter','subject','class_level','resource_kind','quiz_package','all') NOT NULL,
    target_ref VARCHAR(100) NULL,                            -- the id, or item "question:12" / resource kind "pdf"; NULL for all
    audience ENUM('institution','student','both') NOT NULL DEFAULT 'both',
    method ENUM('free','first_n_items_free','first_n_pages_free','percent_off','amount_off','fixed_price','free_for_class_level','free_first_n_per_buyer') NOT NULL,
    value DECIMAL(10,2) NULL,
    priority INT NOT NULL DEFAULT 0,
    starts_at TIMESTAMP NULL,
    ends_at TIMESTAMP NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,                 -- rules are switched off, never deleted
    note VARCHAR(250) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_rules_target (is_active, target_type, target_ref)
);

CREATE TABLE qb_unlocks (                                    -- one purchase per institution opens the answer AND paper use for all its teachers (D66)
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    item_type ENUM('question','concept','resource') NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    unlocked_by BIGINT UNSIGNED NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    reason ENUM('paid','free','partial_free') NOT NULL,
    qb_price_rule_id BIGINT UNSIGNED NULL,
    wallet_txn_ref VARCHAR(100) NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_unlock (institution_id, item_type, item_id),
    INDEX idx_qb_unlocks_spending (institution_id, unlocked_by, created_at),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
ALTER TABLE teachers ADD COLUMN qb_monthly_cap DECIMAL(10,2) NULL;   -- D66: per-teacher monthly question-bank spending cap (NULL = the institution default)

CREATE TABLE qb_student_orders (                             -- bKash to the platform merchant (D58 BkashService); items and amount computed by the server
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_user_id BIGINT UNSIGNED NOT NULL,
    ref VARCHAR(20) NOT NULL,
    items JSON NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_id VARCHAR(100) NULL,
    trx_id VARCHAR(100) NULL,
    status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_student_order_ref (ref),
    INDEX idx_qb_orders_student (institution_id, student_user_id, created_at),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE TABLE qb_student_unlocks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_user_id BIGINT UNSIGNED NOT NULL,
    item_type ENUM('question','concept','resource') NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    reason ENUM('paid','free','partial_free') NOT NULL,
    qb_student_order_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_student_unlock (student_user_id, item_type, item_id),
    INDEX idx_qb_student_unlocks_inst (institution_id, student_user_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_student_order_id) REFERENCES qb_student_orders(id)
);

CREATE TABLE qb_writer_earnings (                            -- D66: a share of every sale, written in the sale's transaction; never deleted (D32)
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    writer_user_id BIGINT UNSIGNED NOT NULL,
    source ENUM('institution_unlock','student_unlock','quiz_package') NOT NULL,
    source_id BIGINT UNSIGNED NOT NULL,
    item_type ENUM('question','concept','resource','quiz_package') NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    sale_amount DECIMAL(10,2) NOT NULL,
    share_percent DECIMAL(5,2) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_earnings_writer (writer_user_id, created_at)
);
CREATE TABLE qb_writer_wallets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    writer_user_id BIGINT UNSIGNED NOT NULL,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    held DECIMAL(12,2) NOT NULL DEFAULT 0,                   -- amount of pending withdrawal requests
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_writer_wallet (writer_user_id)
);
CREATE TABLE qb_writer_wallet_txns (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    writer_user_id BIGINT UNSIGNED NOT NULL,
    type ENUM('earning','withdrawal','adjustment') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    reference VARCHAR(150) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_writer_txns (writer_user_id, created_at)
);
CREATE TABLE qb_withdrawal_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    writer_user_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payout_method ENUM('bank','bkash') NOT NULL,
    payout_account TEXT NOT NULL,                            -- stored encrypted (D33-like: the writer and the Super Admin only)
    status ENUM('pending','paid','rejected') NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP NULL,
    processed_by BIGINT UNSIGNED NULL,
    processed_at TIMESTAMP NULL,
    bank_transaction_id VARCHAR(100) NULL,
    note VARCHAR(250) NULL,
    INDEX idx_qb_withdrawals_status (status, requested_at),
    INDEX idx_qb_withdrawals_writer (writer_user_id, requested_at)
);

CREATE TABLE qb_papers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    program_id BIGINT UNSIGNED NULL,
    qb_subject_id BIGINT UNSIGNED NULL,
    exam_name VARCHAR(200) NULL,
    duration_minutes SMALLINT UNSIGNED NULL,
    total_marks DECIMAL(6,2) NOT NULL DEFAULT 0,
    instructions_json JSON NULL,
    status ENUM('draft','final') NOT NULL DEFAULT 'draft',
    sets_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
    qb_paper_folder_id BIGINT UNSIGNED NULL,                 -- D126: the folder it sits in (none = the top level)
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_papers_owner (institution_id, created_by),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);
CREATE TABLE qb_paper_folders (                              -- D126 (R2.1.5): qbank's question-set folders, for an institution's papers
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,                          -- folders nest; a move into itself or its own sub-folder is refused
    name VARCHAR(150) NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,                     -- a person's own folders (the papers they can see go in them)
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_paper_folders_owner (institution_id, created_by, parent_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (parent_id) REFERENCES qb_paper_folders(id)
);
CREATE TABLE qb_paper_variants (                             -- D126 (2): a final paper's sets, frozen - a later edit never changes a printed set
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    qb_paper_id BIGINT UNSIGNED NOT NULL,
    variant_number TINYINT UNSIGNED NOT NULL,                -- 1 = as built
    code VARCHAR(10) NOT NULL,                               -- what the header prints: A-Z or ক-ঞ...
    strategy VARCHAR(10) NOT NULL,                           -- options | serial | both (qbank's)
    layout_json JSON NOT NULL,                               -- per section: question order, each question's option order and its correct labels
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_paper_variants_number (qb_paper_id, variant_number),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_paper_id) REFERENCES qb_papers(id)
);
CREATE TABLE qb_paper_sections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    qb_paper_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    instruction VARCHAR(500) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_paper_id) REFERENCES qb_papers(id)
);
CREATE TABLE qb_paper_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    qb_paper_section_id BIGINT UNSIGNED NOT NULL,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    marks DECIMAL(5,2) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_paper_section_id) REFERENCES qb_paper_sections(id),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

CREATE TABLE qb_omr_forms (                                   -- D127: one versioned OMR layout per final paper
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    qb_paper_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(10) NOT NULL,
    settings_json JSON NOT NULL,
    layout_version INT UNSIGNED NOT NULL DEFAULT 1,
    locked_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_omr_forms_paper (institution_id, qb_paper_id),
    UNIQUE KEY unique_qb_omr_forms_code (institution_id, code),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_paper_id) REFERENCES qb_papers(id)
);
CREATE TABLE exam_result_sms (                                 -- D161 (4): an exam's result / correction SMS per student; pending until the wallet can pay
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(12) NOT NULL,                                   -- result | correction
    phone VARCHAR(20) NULL,
    message TEXT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'pending',               -- pending | sent | failed | skipped
    sms_log_id BIGINT UNSIGNED NULL,                             -- the billing record when it went
    error VARCHAR(60) NULL,
    attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_exam_result_sms_run (institution_id, exam_id, kind, status),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE TABLE exam_papers (                                     -- D158 (3) / D159 (1)(2): an exam subject's linked final papers; a paper may serve many exams
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    exam_subject_id BIGINT UNSIGNED NOT NULL,
    qb_paper_id BIGINT UNSIGNED NOT NULL,
    qb_subject_id BIGINT UNSIGNED NULL,                       -- D159 (1): the paper's subject block this exam subject takes; NULL = the whole paper
    linked_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_exam_papers_block (exam_subject_id, qb_paper_id, qb_subject_id),
    INDEX idx_exam_papers_subject (exam_subject_id),
    INDEX idx_exam_papers_paper (institution_id, qb_paper_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (exam_subject_id) REFERENCES exam_subjects(id),
    FOREIGN KEY (qb_paper_id) REFERENCES qb_papers(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);
CREATE TABLE qb_omr_scans (                                   -- D127: reviewable answers retain the form layout version used to read them
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    qb_omr_form_id BIGINT UNSIGNED NOT NULL,
    layout_version INT UNSIGNED NOT NULL,
    set_code VARCHAR(10) NULL,
    roll VARCHAR(12) NULL,
    matched_student_id BIGINT UNSIGNED NULL,
    answers_json JSON NULL,
    answered_count SMALLINT UNSIGNED NULL,
    correct_count SMALLINT UNSIGNED NULL,
    obtained_marks DECIMAL(8,2) NULL,
    status VARCHAR(30) NOT NULL,
    comparison_json JSON NULL,
    image_path VARCHAR(255) NULL,
    source VARCHAR(10) NOT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_omr_scans_review (institution_id, qb_omr_form_id, status, id),
    INDEX idx_qb_omr_scans_form_roll (institution_id, qb_omr_form_id, roll),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_omr_form_id) REFERENCES qb_omr_forms(id),
    FOREIGN KEY (matched_student_id) REFERENCES students(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE qb_blueprints (                                 -- D126 (3) (R2.1.5): qbank's assessment blueprints - a platform plan a paper is built from
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name_bn VARCHAR(200) NOT NULL,
    name_en VARCHAR(200) NULL,
    qb_class_level_id BIGINT UNSIGNED NULL,
    qb_subject_id BIGINT UNSIGNED NOT NULL,
    exam_type VARCHAR(50) NULL,
    total_marks DECIMAL(6,2) NOT NULL DEFAULT 0,             -- the sum of its items (count x marks each), kept by the server
    duration_minutes SMALLINT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_blueprints_subject (qb_subject_id, is_active),
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);

CREATE TABLE qb_blueprint_items (                            -- D126 (3): one rule of a blueprint - this many questions of this type (and chapter/topic/difficulty)
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_blueprint_id BIGINT UNSIGNED NOT NULL,
    section_title VARCHAR(200) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    qb_question_type_id BIGINT UNSIGNED NOT NULL,
    question_count SMALLINT UNSIGNED NOT NULL,
    marks_each DECIMAL(5,2) NOT NULL,
    qb_chapter_id BIGINT UNSIGNED NULL,
    qb_topic_id BIGINT UNSIGNED NULL,
    difficulty TINYINT UNSIGNED NULL,
    FOREIGN KEY (qb_blueprint_id) REFERENCES qb_blueprints(id) ON DELETE CASCADE,
    FOREIGN KEY (qb_question_type_id) REFERENCES qb_question_types(id),
    FOREIGN KEY (qb_chapter_id) REFERENCES qb_chapters(id),
    FOREIGN KEY (qb_topic_id) REFERENCES qb_topics(id)
);

CREATE TABLE qb_quiz_packages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    qb_class_level_id BIGINT UNSIGNED NULL,
    qb_subject_id BIGINT UNSIGNED NULL,
    description VARCHAR(1000) NULL,
    validity_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,     -- D66: a package has a validity period
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);
CREATE TABLE qb_quizzes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_quiz_package_id BIGINT UNSIGNED NULL,
    access ENUM('package','free','public') NOT NULL DEFAULT 'package',   -- D66: some quizzes free, some public (no login)
    title VARCHAR(200) NOT NULL,
    qb_subject_id BIGINT UNSIGNED NULL,
    qb_chapter_id BIGINT UNSIGNED NULL,
    qb_topic_id BIGINT UNSIGNED NULL,
    duration_minutes SMALLINT UNSIGNED NOT NULL,
    question_count SMALLINT UNSIGNED NOT NULL,
    rule ENUM('fixed','random_from_scope') NOT NULL DEFAULT 'fixed',
    pass_mark DECIMAL(5,2) NULL,
    opens_at TIMESTAMP NULL,
    closes_at TIMESTAMP NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_quizzes_access (is_active, access),
    FOREIGN KEY (qb_quiz_package_id) REFERENCES qb_quiz_packages(id)
);
CREATE TABLE qb_quiz_questions (
    qb_quiz_id BIGINT UNSIGNED NOT NULL,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (qb_quiz_id, qb_question_id),
    FOREIGN KEY (qb_quiz_id) REFERENCES qb_quizzes(id),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);
CREATE TABLE qb_student_package_access (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_user_id BIGINT UNSIGNED NOT NULL,
    qb_quiz_package_id BIGINT UNSIGNED NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    qb_student_order_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_package_access (student_user_id, qb_quiz_package_id, expires_at),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_quiz_package_id) REFERENCES qb_quiz_packages(id),
    FOREIGN KEY (qb_student_order_id) REFERENCES qb_student_orders(id)
);
CREATE TABLE qb_quiz_attempts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_user_id BIGINT UNSIGNED NOT NULL,
    qb_quiz_id BIGINT UNSIGNED NOT NULL,
    started_at TIMESTAMP NOT NULL,
    submitted_at TIMESTAMP NULL,
    score DECIMAL(6,2) NULL,
    total DECIMAL(6,2) NULL,
    answers JSON NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_attempts_student (institution_id, student_user_id, qb_quiz_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_quiz_id) REFERENCES qb_quizzes(id)
);
CREATE TABLE qb_import_map (                                -- D69 (QB.11): which qbank row became which row here, so qb:import-from-qbank runs once per row
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(30) NOT NULL,                             -- 'qbank'
    source_table VARCHAR(60) NOT NULL,
    source_id BIGINT UNSIGNED NOT NULL,
    target_table VARCHAR(60) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_import_map (source, source_table, source_id)
);
CREATE TABLE qb_graph_datasets (                            -- D115 (R2.1.2): qbank's graph datasets - a table of numbers a question's graph draws from
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    qb_question_id BIGINT UNSIGNED NULL,                     -- the question it belongs to (NULL while being written)
    name VARCHAR(160) NOT NULL,
    source_type VARCHAR(40) NOT NULL DEFAULT 'manual',
    headers JSON NOT NULL,
    row_count INT UNSIGNED NOT NULL DEFAULT 0,               -- at most 50,000 rows, 80 columns, 1,000,000 cells, 2,048 characters a cell
    column_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    checksum VARCHAR(64) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,                 -- an edit names the version it started from; an older one is refused
    rows_json LONGTEXT NULL,
    metadata JSON NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_graph_datasets_uuid (uuid),
    INDEX idx_qb_graph_datasets_question (qb_question_id, deleted_at),
    INDEX idx_qb_graph_datasets_checksum (created_by, checksum),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

CREATE TABLE qb_curriculum_versions (                        -- D138/D139: syllabus editions for a language subject
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_subject_id BIGINT UNSIGNED NOT NULL,
    version_key VARCHAR(64) NOT NULL,
    name_bn VARCHAR(200) NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    CONSTRAINT unique_qb_curriculum_subject_version UNIQUE (qb_subject_id, version_key),
    INDEX idx_qb_curriculum_versions_subject (qb_subject_id, is_active, sort_order),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);

CREATE TABLE qb_curriculum_version_class_level (             -- D145: class applicability of a curriculum version
    qb_curriculum_version_id BIGINT UNSIGNED NOT NULL,
    qb_class_level_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (qb_curriculum_version_id, qb_class_level_id),
    INDEX idx_qb_curriculum_version_classes (qb_class_level_id, qb_curriculum_version_id),
    FOREIGN KEY (qb_curriculum_version_id) REFERENCES qb_curriculum_versions(id),
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id)
);

CREATE TABLE qb_curriculum_nodes (                            -- D138/D139: arbitrary-depth Part/Unit/Lesson/Text/Topic/Other tree
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_curriculum_version_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    kind VARCHAR(20) NOT NULL,
    name_bn VARCHAR(200) NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    legacy_qb_chapter_id BIGINT UNSIGNED NULL,
    legacy_qb_topic_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_curriculum_nodes_parent_order (qb_curriculum_version_id, parent_id, sort_order),
    CONSTRAINT unique_qb_curriculum_legacy_chapter UNIQUE (legacy_qb_chapter_id),
    CONSTRAINT unique_qb_curriculum_legacy_topic UNIQUE (legacy_qb_topic_id),
    FOREIGN KEY (qb_curriculum_version_id) REFERENCES qb_curriculum_versions(id),
    FOREIGN KEY (parent_id) REFERENCES qb_curriculum_nodes(id),
    FOREIGN KEY (legacy_qb_chapter_id) REFERENCES qb_chapters(id),
    FOREIGN KEY (legacy_qb_topic_id) REFERENCES qb_topics(id)
);

CREATE TABLE qb_question_curriculum_nodes (                    -- D138/D139: question ↔ zero or more syllabus nodes
    qb_question_id BIGINT UNSIGNED NOT NULL,
    qb_curriculum_node_id BIGINT UNSIGNED NOT NULL,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT pk_qb_question_curriculum_nodes PRIMARY KEY (qb_question_id, qb_curriculum_node_id),
    INDEX idx_qb_curriculum_node_questions (qb_curriculum_node_id, qb_question_id),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id),
    FOREIGN KEY (qb_curriculum_node_id) REFERENCES qb_curriculum_nodes(id)
);

CREATE TABLE qb_import_batches (                             -- D123 (R2.1.3): one JSON/TOON question import, staged before anything enters the bank
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    format VARCHAR(10) NOT NULL,                             -- json | toon | pdf (D124)
    schema_version VARCHAR(80) NULL,
    files JSON NOT NULL,                                     -- [{name, sha256, bytes}] in upload order
    source_sha256 CHAR(64) NOT NULL,                         -- of all files together: the same upload by the same person reopens this batch
    status VARCHAR(20) NOT NULL DEFAULT 'parsing',           -- parsing | ready | failed | finalized
    total_records INT UNSIGNED NOT NULL DEFAULT 0,
    parsed_records INT UNSIGNED NOT NULL DEFAULT 0,
    valid_records INT UNSIGNED NOT NULL DEFAULT 0,
    invalid_records INT UNSIGNED NOT NULL DEFAULT 0,
    duplicate_records INT UNSIGNED NOT NULL DEFAULT 0,
    imported_records INT UNSIGNED NOT NULL DEFAULT 0,
    error VARCHAR(500) NULL,                                 -- a whole-file problem (unreadable JSON/TOON, too large)
    page_from SMALLINT UNSIGNED NULL,                        -- D124 (R2.1.4): a PDF's chosen page range
    page_to SMALLINT UNSIGNED NULL,
    document_kind VARCHAR(10) NULL,                          -- D124: text | hybrid | scanned (a PDF)
    unreadable_pages JSON NULL,                              -- D124: page numbers with too little text to read, never reported as imported
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_import_batches_uuid (uuid),
    INDEX idx_qb_import_batches_owner (created_by, source_sha256),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE qb_import_records (                             -- D123: one staged question of a batch, edited here until finalized as a draft
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_import_batch_id BIGINT UNSIGNED NOT NULL,
    file_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    record_index INT UNSIGNED NOT NULL,                      -- position in its file (0-based), so a chunk re-run never doubles a record
    page_number SMALLINT UNSIGNED NULL,                      -- D124: the PDF page the question came from
    type_slug VARCHAR(80) NULL,
    payload JSON NOT NULL,                                   -- the canonical record (same for JSON and TOON)
    errors JSON NULL,                                        -- [{path, message}]
    warnings JSON NULL,
    has_math TINYINT(1) NOT NULL DEFAULT 0,
    duplicate_status VARCHAR(20) NOT NULL DEFAULT 'none',    -- none | possible | skip | import
    duplicate_question_id BIGINT UNSIGNED NULL,
    selected TINYINT(1) NOT NULL DEFAULT 0,
    qb_question_id BIGINT UNSIGNED NULL,                     -- the draft it became
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_import_records_position (qb_import_batch_id, file_index, record_index),
    FOREIGN KEY (qb_import_batch_id) REFERENCES qb_import_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (duplicate_question_id) REFERENCES qb_questions(id),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

-- D84: tenant-bound refund history/status and original-line cap checks.
CREATE INDEX idx_fee_refunds_inst_status_created ON fee_refunds(institution_id, status, created_at, id);
CREATE INDEX idx_fee_refunds_inst_student_created ON fee_refunds(institution_id, student_id, created_at, id);
CREATE INDEX idx_fee_payments_inst_reverses ON fee_payments(institution_id, reverses_id);

-- D88: staff authorization is scoped by department membership and code-owned permission keys.
CREATE UNIQUE INDEX unique_users_id_institution ON users(id, institution_id);

-- D90: first-principal review and purpose/contact-bound activation evidence.
-- Actor role, token ownership, state and generation invariants are service-enforced.
CREATE TABLE institution_registrations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    first_admin_id BIGINT UNSIGNED NOT NULL,
    source VARCHAR(20) NOT NULL,
    review_status VARCHAR(20) NOT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    reviewed_at TIMESTAMP NULL,
    rejection_reason VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_registration_institution (institution_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (first_admin_id, institution_id) REFERENCES users(id, institution_id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE account_activation_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    public_id CHAR(36) NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    generation INT UNSIGNED NOT NULL,
    channel VARCHAR(10) NOT NULL,
    contact_hash CHAR(64) NOT NULL,
    otp_token_id BIGINT UNSIGNED NULL,
    authorized_by BIGINT UNSIGNED NULL,
    status VARCHAR(20) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    contact_verified_at TIMESTAMP NULL,
    consumed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_activation_request_public (institution_id, public_id),
    UNIQUE KEY unique_activation_request_generation (institution_id, user_id, purpose, generation),
    INDEX idx_activation_request_pending (institution_id, user_id, purpose, status),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (user_id, institution_id) REFERENCES users(id, institution_id),
    FOREIGN KEY (otp_token_id) REFERENCES otp_tokens(id),
    FOREIGN KEY (authorized_by) REFERENCES users(id)
);

CREATE TABLE institution_departments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(40) NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NULL,
    status ENUM('active','archived') NOT NULL DEFAULT 'active',
    created_by BIGINT UNSIGNED NOT NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    archived_at TIMESTAMP NULL,
    UNIQUE KEY unique_department_name (institution_id, name),
    UNIQUE KEY unique_department_code (institution_id, code),
    UNIQUE KEY unique_department_tenant_identity (id, institution_id),
    INDEX idx_departments_institution_status (institution_id, status, id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (created_by, institution_id) REFERENCES users(id, institution_id),
    FOREIGN KEY (updated_by, institution_id) REFERENCES users(id, institution_id)
);

CREATE TABLE department_memberships (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    department_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    status ENUM('active','inactive','ended') NOT NULL DEFAULT 'active',
    starts_at DATE NULL,
    ends_at DATE NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_department_membership (institution_id, department_id, user_id),
    UNIQUE KEY unique_membership_tenant_identity (id, institution_id),
    INDEX idx_department_memberships_user_status (institution_id, user_id, status),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (department_id, institution_id) REFERENCES institution_departments(id, institution_id),
    FOREIGN KEY (user_id, institution_id) REFERENCES users(id, institution_id),
    FOREIGN KEY (created_by, institution_id) REFERENCES users(id, institution_id)
);

CREATE TABLE department_duties (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    department_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NULL,
    permission_keys JSON NOT NULL,
    status ENUM('active','archived') NOT NULL DEFAULT 'active',
    created_by BIGINT UNSIGNED NOT NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_department_duty_code (institution_id, department_id, code),
    UNIQUE KEY unique_duty_tenant_identity (id, institution_id),
    INDEX idx_department_duties_status (institution_id, department_id, status),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (department_id, institution_id) REFERENCES institution_departments(id, institution_id),
    FOREIGN KEY (created_by, institution_id) REFERENCES users(id, institution_id),
    FOREIGN KEY (updated_by, institution_id) REFERENCES users(id, institution_id)
);

CREATE TABLE department_duty_assignments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    membership_id BIGINT UNSIGNED NOT NULL,
    duty_id BIGINT UNSIGNED NOT NULL,
    status ENUM('active','revoked') NOT NULL DEFAULT 'active',
    assigned_by BIGINT UNSIGNED NOT NULL,
    revoked_by BIGINT UNSIGNED NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP NULL,
    UNIQUE KEY unique_membership_duty (institution_id, membership_id, duty_id),
    INDEX idx_duty_assignments_membership_status (institution_id, membership_id, status),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (membership_id, institution_id) REFERENCES department_memberships(id, institution_id),
    FOREIGN KEY (duty_id, institution_id) REFERENCES department_duties(id, institution_id),
    FOREIGN KEY (assigned_by, institution_id) REFERENCES users(id, institution_id),
    FOREIGN KEY (revoked_by, institution_id) REFERENCES users(id, institution_id)
);

-- D96 design contract only: current leave-linked occurrence projection plus append-only lifecycle events.
-- Preserve legacy `substitutions` rows and storage. No migration, backfill, runtime, or purge implementation is authorized here.
-- Future D27 tenant-purge order: events before slots and operations, then leave_applications/users/departments.
-- @design-only D98: leave_substitution_slots
CREATE TABLE leave_substitution_slots (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    leave_application_id BIGINT UNSIGNED NOT NULL,
    routine_id BIGINT UNSIGNED NOT NULL,
    original_teacher_id BIGINT UNSIGNED NOT NULL,
    occurrence_date DATE NOT NULL,
    source_start_time TIME NOT NULL,
    source_end_time TIME NOT NULL,
    source_room_no VARCHAR(20) NULL,
    substitute_teacher_id BIGINT UNSIGNED NULL,
    status ENUM('unassigned','nominated','offered','confirmed','cancelled') NOT NULL DEFAULT 'unassigned',
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_leave_substitution_occurrence (institution_id, leave_application_id, routine_id, occurrence_date),
    UNIQUE KEY unique_leave_substitution_slot_tenant_identity (id, institution_id),
    UNIQUE KEY unique_leave_substitution_slot_leave_identity (id, institution_id, leave_application_id),
    INDEX idx_leave_substitution_leave_date (institution_id, leave_application_id, occurrence_date),
    INDEX idx_leave_substitution_teacher_date (institution_id, substitute_teacher_id, occurrence_date, status),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (leave_application_id, institution_id) REFERENCES leave_applications(id, institution_id),
    FOREIGN KEY (routine_id, institution_id) REFERENCES routines(id, institution_id),
    FOREIGN KEY (original_teacher_id, institution_id) REFERENCES teachers(id, institution_id),
    FOREIGN KEY (substitute_teacher_id, institution_id) REFERENCES teachers(id, institution_id)
);

-- D99 design only: immutable successful request receipt, not an outbox or deployed table.
-- Result manifest is the ordered linked event set, including an empty set for zero-slot success.
-- @design-only D99: leave_substitution_operations
CREATE TABLE leave_substitution_operations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    leave_application_id BIGINT UNSIGNED NULL,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    department_id BIGINT UNSIGNED NULL,
    action VARCHAR(64) NOT NULL,
    idempotency_key_sha256 CHAR(64) NOT NULL,
    payload_sha256 CHAR(64) NOT NULL,
    result_code VARCHAR(40) NOT NULL,
    result_http_status SMALLINT UNSIGNED NOT NULL,
    result_slot_count INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_leave_substitution_operation_request (institution_id, user_id, idempotency_key_sha256),
    UNIQUE KEY unique_leave_substitution_operation_tenant_identity (id, institution_id),
    UNIQUE KEY unique_leave_substitution_operation_actor_identity (id, institution_id, user_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (leave_application_id, institution_id) REFERENCES leave_applications(id, institution_id),
    FOREIGN KEY (user_id, institution_id) REFERENCES users(id, institution_id),
    FOREIGN KEY (department_id, institution_id) REFERENCES institution_departments(id, institution_id)
);

-- @design-only D98: leave_substitution_events
CREATE TABLE leave_substitution_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    leave_substitution_operation_id BIGINT UNSIGNED NOT NULL,
    institution_id BIGINT UNSIGNED NOT NULL,
    leave_substitution_slot_id BIGINT UNSIGNED NOT NULL,
    leave_application_id BIGINT UNSIGNED NOT NULL,
    version INT UNSIGNED NOT NULL,
    result_status ENUM('unassigned','nominated','offered','confirmed','cancelled') NOT NULL,
    event_type ENUM('slot_created','leave_approved','nomination_set','nomination_cleared','offer_created','offer_accepted','offer_declined','cover_replaced','cover_cleared','leave_rejected','leave_cancelled','source_invalidated','substitute_leave_invalidated','source_refreshed') NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    original_teacher_id BIGINT UNSIGNED NOT NULL,
    source_program_id BIGINT UNSIGNED NOT NULL,
    source_batch_id BIGINT UNSIGNED NULL,
    source_subject_id BIGINT UNSIGNED NOT NULL,
    substitute_teacher_id BIGINT UNSIGNED NULL,
    department_id BIGINT UNSIGNED NULL,
    occurrence_date DATE NOT NULL,
    source_start_time TIME NOT NULL,
    source_end_time TIME NOT NULL,
    source_room_no VARCHAR(20) NULL,
    reason_code VARCHAR(40) NULL,
    reason_note VARCHAR(255) NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    payload_sha256 CHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_leave_substitution_event_version (institution_id, leave_substitution_slot_id, version),
    UNIQUE KEY unique_leave_substitution_event_tenant_identity (id, institution_id),
    UNIQUE KEY unique_leave_substitution_event_request (institution_id, user_id, idempotency_key),
    UNIQUE KEY unique_leave_substitution_operation_slot (institution_id, leave_substitution_operation_id, leave_substitution_slot_id),
    INDEX idx_leave_substitution_events_leave (institution_id, leave_application_id, occurrence_date, id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (leave_substitution_operation_id, institution_id, user_id) REFERENCES leave_substitution_operations(id, institution_id, user_id),
    FOREIGN KEY (leave_substitution_slot_id, institution_id, leave_application_id) REFERENCES leave_substitution_slots(id, institution_id, leave_application_id),
    FOREIGN KEY (leave_application_id, institution_id) REFERENCES leave_applications(id, institution_id),
    FOREIGN KEY (user_id, institution_id) REFERENCES users(id, institution_id),
    FOREIGN KEY (source_program_id, institution_id) REFERENCES programs(id, institution_id),
    FOREIGN KEY (source_batch_id, institution_id) REFERENCES batches(id, institution_id),
    FOREIGN KEY (source_subject_id, institution_id) REFERENCES subjects(id, institution_id),
    FOREIGN KEY (original_teacher_id, institution_id) REFERENCES teachers(id, institution_id),
    FOREIGN KEY (substitute_teacher_id, institution_id) REFERENCES teachers(id, institution_id),
    FOREIGN KEY (department_id, institution_id) REFERENCES institution_departments(id, institution_id)
);

CREATE TABLE exam_mark_submissions (                           -- D162: an exam subject's marks - draft / submitted to the head / update request
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    exam_subject_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',                 -- draft | submitted | unlock_requested | unlocked (no row = draft)
    submitted_by BIGINT UNSIGNED NULL,
    submitted_at TIMESTAMP NULL,
    request_reason VARCHAR(500) NULL,                            -- the teacher's reason for an update request
    requested_by BIGINT UNSIGNED NULL,
    requested_at TIMESTAMP NULL,
    decided_by BIGINT UNSIGNED NULL,                             -- the head who approved / rejected
    decided_at TIMESTAMP NULL,
    decision_note VARCHAR(500) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_exam_mark_submissions_subject (exam_subject_id),
    INDEX idx_exam_mark_submissions_status (institution_id, status),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (exam_subject_id) REFERENCES exam_subjects(id)
);
