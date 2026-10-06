# Advanced Features — Revision 5

---

## 1. AI-Powered Features (Claude/ChatGPT Integration)

### Overview
SaaS platform-এ AI assistant যোগ করা। Admin প্রশ্ন করলে AI উত্তর দেবে।

### Use Cases
```
1. "Class 10-এর গত মাসের উপস্থিতি কেমন ছিল?" → AI pulls data + natural language answer
2. "কোন ছাত্রের ফি সবচেয়ে বেশি বকেয়া?" → AI aggregates + ranks
3. "এই মাসে কোন বিষয়ে পাসের হার কম?" → AI analyzes results
4. Notice লেখতে সাহায্য → AI drafts notice from bullet points
5. Homework question generate → AI creates MCQ from topic
```

### AiAssistantService.php
```php
class AiAssistantService
{
    public function chat(string $prompt, array $institutionContext): string
    {
        // Inject institution data into context
        $systemPrompt = "You are a helpful institution management assistant for {$institutionContext['name']}. 
            Total students: {$institutionContext['total_students']}. 
            Answer questions about this institution only. Be concise and helpful.";

        $response = Http::withHeaders([
            'x-api-key' => config('services.anthropic.key'),
            'anthropic-version' => '2023-06-01',
        ])->post('https://api.anthropic.com/v1/messages', [
            'model'      => 'claude-haiku-4-5-20251001',
            'max_tokens' => 500,
            'system'     => $systemPrompt,
            'messages'   => [['role' => 'user', 'content' => $prompt]],
        ]);

        return $response->json('content.0.text');
    }

    public function generateNotice(string $topic, string $audience): string
    {
        return $this->chat(
            "Write a formal institution notice about: {$topic}. Target: {$audience}. 
             Include: date, subject, body, signature line. Format: plain text.",
            app('currentInstitution')->toArray()
        );
    }

    public function generateQuestions(string $topic, string $subject, int $count = 5): array
    {
        $response = $this->chat(
            "Generate {$count} MCQ questions about '{$topic}' for subject '{$subject}'. 
             Format as JSON array: [{question, options:[A,B,C,D], answer, explanation}]",
            []
        );
        return json_decode($response, true) ?? [];
    }
}
```

### API
```
POST /ai/chat              → AI chat (admin/teacher)
POST /ai/generate-notice   → AI-drafted notice
POST /ai/generate-questions → MCQ from topic
GET  /ai/analytics-summary → AI summary of institution performance
```

### React Component
```jsx
// components/AiAssistant.jsx
const [messages, setMessages] = useState([])
const [input, setInput] = useState('')

const chatMutation = useMutation({
  mutationFn: (msg) => api.post('/ai/chat', { message: msg }),
  onSuccess: (res) => {
    setMessages(prev => [...prev,
      { role: 'user', content: input },
      { role: 'assistant', content: res.data.reply }
    ])
    setInput('')
  }
})
```

---

## 2. Student Analytics Dashboard (Performance Insights)

### Overview
ছাত্রের performance trend, attendance pattern, subject-wise weakness analysis।

### Analytics Data Points
```php
// GET /students/{id}/analytics
public function getStudentAnalytics(int $studentId): array
{
    $student = Student::findOrFail($studentId);

    // 6-month result trend
    $resultTrend = Result::where('student_id', $studentId)
        ->with(['exam', 'subject'])
        ->latest()
        ->take(50)
        ->get()
        ->groupBy('exam.name')
        ->map(fn($r) => [
            'exam' => $r->first()->exam->name,
            'gpa'  => round($r->avg('grade_point'), 2),
            'avg'  => round($r->avg('marks_obtained'), 2),
        ]);

    // Subject-wise performance
    $subjectPerf = Result::where('student_id', $studentId)
        ->with('subject')
        ->get()
        ->groupBy('subject.name')
        ->map(fn($r) => [
            'subject'  => $r->first()->subject->name,
            'avg'      => round($r->avg('marks_obtained'), 2),
            'highest'  => $r->max('marks_obtained'),
            'lowest'   => $r->min('marks_obtained'),
            'trend'    => $r->avg('marks_obtained') > 60 ? 'good' : 'needs_improvement',
        ]);

    // Monthly attendance trend
    $attendanceTrend = Attendance::where('student_id', $studentId)
        ->selectRaw('DATE_FORMAT(date, "%Y-%m") as month, 
                     SUM(status="present") as present,
                     COUNT(*) as total')
        ->groupBy('month')
        ->orderBy('month')
        ->take(6)
        ->get()
        ->map(fn($r) => [
            'month'      => $r->month,
            'percentage' => $r->total > 0 ? round(($r->present / $r->total) * 100, 1) : 0,
        ]);

    // Class rank over time
    $classRanks = ReportCardSummary::where('student_id', $studentId)
        ->with('exam')
        ->get()
        ->map(fn($r) => [
            'exam'     => $r->exam->name,
            'position' => $r->class_position,
            'gpa'      => $r->gpa,
        ]);

    return compact('resultTrend', 'subjectPerf', 'attendanceTrend', 'classRanks');
}
```

### React Analytics Page
```jsx
// pages/admin/students/StudentAnalytics.jsx
// Using recharts:
// 1. GPA trend line chart (exam-wise)
// 2. Subject performance radar chart
// 3. Monthly attendance bar chart
// 4. Class rank progression line
// 5. Subject weakness highlight (red if avg < 40)
```

---

## 3. School Bus Live Tracking (GPS)

### Overview
Enterprise plan-এ bus-এর real-time GPS location tracking।

### Implementation Approach
```
Hardware: GPS tracker (BDT 2000-5000) → SIM card → sends location to our server
API: tracker sends GET/POST to /api/vehicles/{id}/location every 30 seconds
Parent: React Native app poll করে bus location দেখে
```

### Database
```sql
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
```

### API
```
POST /vehicles/{id}/location    → GPS tracker sends location (API key auth)
GET  /vehicles/{id}/live        → Parent: current bus location
GET  /vehicles/{id}/route-today → Today's route with ETA
```

### React Native Map (Parent App)
```javascript
import MapView, { Marker, Polyline } from 'react-native-maps'

// Bus location poll every 30 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    const res = await api.get(`/vehicles/${vehicleId}/live`)
    setBusLocation(res.data.data)
  }, 30000)
  return () => clearInterval(interval)
}, [])
```

---

## 4. Progressive Web App (PWA) Support

### Overview
React app-কে PWA করা — parent/student mobile-এ install করতে পারবে।

### vite.config.js
```javascript
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.png'],
      manifest: {
        name: 'Education Management',
        short_name: 'SchoolApp',
        // theme_color / name / icons are NOT set here: each institution has its own manifest, served by GET /api/v1/manifest.webmanifest
        // (docs/THEMING.md); index.html links to that URL.
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Offline: cache API responses
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/(student\/routine|notices|student\/results)/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxAgeSeconds: 3600 } },
          },
        ],
      },
    }),
  ],
})
```

### Offline Features (PWA)
```
Cached for offline:
- Student's class routine
- Recent notices (last 10)
- Last result summary
- Institution contact info

Not available offline:
- Fee payment
- Attendance
- Real-time notifications
```

---

## 5. Dark Mode / Theme Customization — merged into the theme system (Revision 7)
আলাদা করে বানাবেন না। Light/Dark/Auto এখন `institutions.theme_mode` (প্রতিষ্ঠানের default) + ব্যবহারকারীর নিজের পছন্দ (`localStorage['color-mode']`), `theme/ThemeProvider.jsx` ও `tokens.css`-এর `.dark` অংশে (`docs/THEMING.md`)। পুরনো `useTheme.js`/`tailwind.config.js` এখানে আর নেই।

---
## 6. Full Data Export (Institution Backup)

### Overview
Institution admin সব ডেটা একটি ZIP-এ export করতে পারবে।
GDPR compliance + institution data portability।

### What's Exported
```
institution-data-export-2025-01-15.zip
├── students.xlsx          ← সব ছাত্রের তথ্য
├── teachers.xlsx          ← সব শিক্ষকের তথ্য
├── attendance.xlsx        ← সব বছরের attendance
├── results.xlsx           ← সব পরীক্ষার রেজাল্ট
├── fee-payments.xlsx      ← সব ফি পেমেন্ট
├── expenses.xlsx          ← সব খরচের তথ্য
├── notices.json           ← সব নোটিশ
├── classes.json           ← ক্লাস ও সেকশন কনফিগ
└── README.txt             ← How to import guide
```

### ExportController — **সরানো হয়েছে (Revision 15)**
পুরনো `exportAll()` একটি HTTP request-এর ভিতরে সবকিছু zip করত, `storage_path()` ও `Excel::store(..., 'local')`-এ — ভারী (সময়-সীমা), এবং একাধিক সার্ভারে ভাঙে (zip এক সার্ভারে, ডাউনলোড অন্যটিতে)। এর জায়গায় **`docs/modules/platform-ops.md` §৬ (D38)**: queue-job `tenant_exports`, এনক্রিপ্টেড, `private` ডিস্কে (`docs/architecture/file-storage.md`), `temporaryUrl()`-এ ডাউনলোড। কোড এখানে আর নেই; "Full Data Export" মডিউল-কী `analytics`-এর পাশে থাকলেও বাস্তবায়ন সেই job।


### API
```
POST /institution/export/request    → Export শুরু করুন (Queue-এ)
GET  /institution/export/{jobId}    → Export progress চেক
GET  /institution/export/{jobId}/download → Ready হলে download
```

---

## 7. Exam Admit Card Generation

### Overview
প্রতিটি পরীক্ষার আগে ছাত্রদের Admit Card PDF generate করা।

### Database
```sql
ALTER TABLE exams ADD COLUMN admit_card_available TINYINT(1) DEFAULT 0;
ALTER TABLE exams ADD COLUMN admit_card_from DATE;
ALTER TABLE exams ADD COLUMN exam_center VARCHAR(150);
ALTER TABLE exams ADD COLUMN admit_card_instructions TEXT;
```

> **Revision 6.3:** "Subject / Date & Time" সারি আসে `exam_subjects` (`exam_date`, `start_time`, `end_time`, `room`) থেকে — আগে এর কোনো উৎস ছিল না। Admit card তৈরির আগে প্রতিটি `exam_subjects` row-এ তারিখ থাকতে হবে (না থাকলে 422 "পরীক্ষার সময়সূচি সম্পূর্ণ করুন")।

### Admit Card Layout (A5 size)
```
┌─────────────────────────────────────┐
│ [LOGO]  INSTITUTION NAME                 │
│         ADMIT CARD — Annual Exam    │
├─────────────────────────────────────┤
│ Student: Raju Ahmed                 │
│ ID: DHA-2025-001  Roll: 05         │
│ Class: 10A                         │
├──────────────┬──────────────────────┤
│ Subject      │ Date & Time         │
├──────────────┼──────────────────────┤
│ Bengali      │ 01 Mar, 9:00 AM     │
│ English      │ 03 Mar, 9:00 AM     │
│ Math         │ 05 Mar, 9:00 AM     │
├──────────────┴──────────────────────┤
│ Exam Center: Main Building, Room 5  │
│ [QR CODE]                          │
│ Principal Signature                 │
└─────────────────────────────────────┘
```

### API
```
POST /exams/{id}/admit-cards/generate  → Bulk generate all students
GET  /student/exams/{id}/admit-card    → Student's own admit card PDF
GET  /exams/{id}/admit-cards/bulk      → All admit cards (class-wise) PDF
```

---

## 8. Scholarship Management

### Database
```sql
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
    documents JSON,     -- uploaded document paths
    gpa DECIMAL(3,2),
    household_income VARCHAR(100),
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    awarded_amount DECIMAL(10,2) NULL,
    approved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_application (scholarship_id, student_id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
```

### API
```
GET/POST  /scholarships                    → List & create
POST      /scholarships/{id}/apply         → Student applies
GET       /scholarships/{id}/applications  → Admin views applications
PATCH     /scholarships/applications/{id}/award → Award scholarship
GET       /student/scholarships            → Student's applications
```

---

## 9. Institution Events & Competition Management

### Database
```sql
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
    program_ids JSON,           -- specific classes (null = all)
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
    UNIQUE KEY unique_registration (event_id, student_id)
);

CREATE TABLE event_results (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    position INT,
    award VARCHAR(100),
    points INT DEFAULT 0,
    remarks TEXT,
    certificate_issued TINYINT(1) DEFAULT 0
);
```

### API
```
GET/POST  /events                        → Event list & create
POST      /events/{id}/register          → Student registers
PATCH     /events/{id}/attendance/{sid}  → Mark attendance
POST      /events/{id}/results           → Add results/winners
GET       /events/upcoming               → Upcoming events
GET       /student/events                → Student's registrations
```

---

## 10. Teacher Training & CPD Tracking

### Database
```sql
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
    program_id BIGINT UNSIGNED,
    title VARCHAR(150),            -- self-reported training
    type VARCHAR(50),
    completed_date DATE,
    duration_hours INT,
    certificate_path VARCHAR(255),
    status ENUM('planned','completed','cancelled') DEFAULT 'planned',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);
```

### API
```
GET/POST  /training-programs               → Training CRUD
POST      /training-programs/{id}/enroll   → Enroll teacher
PATCH     /training-programs/{id}/complete → Mark complete + upload cert
GET       /teachers/{id}/trainings         → Teacher's CPD history
GET       /hr/cpd-report                   → Institution-wide CPD summary
```

---

## Feature Summary Table (All Modules)

| Module | Plan | Phase | DB Tables |
|--------|------|-------|-----------|
| Excel Student Import | All | 1 | student_import_logs |
| Excel Mark Upload | All | 1 | (uses results) |
| Fee Installment | Pro+ | 2 | fee_installment_plans, fee_installments |
| Homework Submission | All | 2 | homework_submissions |
| Online Exam/Quiz | Pro+ | 3 | online_exams, exam_questions, exam_attempts |
| Behavior Log | All | 2 | behavior_logs |
| Health Records | All | 2 | student_health_records |
| Certificate Generator | All | 3 | certificates |
| Visitor Management | All | 3 | visitor_logs |
| WhatsApp Notifications | Pro+ | 3 | (users.whatsapp_number) |
| Fee QR Code | All | 2 | (no new table) |
| Bulk Fee Reminder | All | 2 | (uses sms_logs) |
| Report Card Email | All | 2 | (uses email) |
| Bulk ID Card Print | All | 1 | (no new table) |
| Parent Meeting Scheduler | All | 2 | parent_meetings |
| Multi-Branch Support | Enterprise | 3 | (institutions.parent_institution_id) |
| Alumni Module | All | 3 | alumni |
| 2FA via OTP | Pro+ | 3 | otp_tokens |
| Per-Institution Rate Limiting | All | 2 | (Redis) |
| Zoom API Auto-Create | Enterprise | 4 | (online_classes.teacher_start_url) |
| AI Assistant | Pro+ | 4 | (no DB — API call) |
| Student Analytics | Pro+ | 3 | (aggregates existing) |
| Bus GPS Tracking | Enterprise | 4 | vehicle_locations |
| PWA Support | All | 3 | (frontend only) |
| Dark Mode | All | 2 | (institutions.primary_color) |
| Full Data Export | All | 3 | (no new table) |
| Exam Admit Card | All | 2 | (exams table extension) |
| Scholarship Management | Pro+ | 3 | scholarships, scholarship_applications |
| Events & Competitions | All | 3 | institution_events, event_registrations, event_results |
| Teacher CPD Tracking | All | 2 | training_programs, teacher_trainings |
