# Shared Component Library

## Layout Components

### PageHeader.jsx
```jsx
// Props: title, breadcrumbs, actions
<PageHeader
  title="ছাত্র তালিকা"
  breadcrumbs={[{label:"Dashboard", path:"/admin"}, {label:"Students"}]}
  actions={<Button onClick={openAdd}>+ ভর্তি করুন</Button>}
/>
// Sits at the top of every page. Breadcrumb + Action buttons.
```

### StatCard.jsx
```jsx
// Props: title, value, icon, color, trend={value, up}
<StatCard title="মোট ছাত্র" value={1240} icon="🎓" color="blue" trend={{value:12, up:true}}/>
// Dashboard card. Trend arrow shows change.
```

## Table & List Components

### DataTable.jsx
> **Revision 8:** `DataTable`-এর উপস্থাপনা `list` slot-এর variant (`table` | `cards`) — pack ঠিক করে (≥৭৬৮px); **<৭৬৮px-এ সব pack-এ সবসময় `cards`** (প্রথম ৩ কলাম দৃশ্যমান, বাকি ট্যাপে)। পুরনো `mobileCard` prop নেই। একইভাবে `Modal`, `Tabs`, `StatCard` এখন `ui/variants/*`-এর slot-component (`docs/UI-PACKS.md` §৩, §৬)।
```jsx
// Props: columns, data, loading, pagination, searchable, onRowClick, actions
<DataTable
  columns={[
    {key:'name', label:'নাম'},
    {key:'batch', label: t('batch')},   // never a hardcoded 'শ্রেণী'/'শাখা' (docs/LOCKED-DECISIONS.md D5)
    {key:'status', label:'অবস্থা', render: row => <StatusBadge status={row.status}/>},
  ]}
  data={students}
  loading={isLoading}  // → skeleton rows দেখায়
  searchable          // → সার্চ বক্স যোগ হয়
  pagination={{page, total, perPage:20, onChange:setPage}}
  actions={row => <EditDeleteButtons row={row}/>}
/>
```

### StatusBadge.jsx
```jsx
// Props: status, size
<StatusBadge status="active"/>   // 🟢 সক্রিয় (সবুজ)
<StatusBadge status="inactive"/> // 🔴 নিষ্ক্রিয় (লাল)
<StatusBadge status="paid"/>     // 🟢 পরিশোধিত
<StatusBadge status="due"/>      // 🟠 বকেয়া
<StatusBadge status="pending"/>  // 🟡 অপেক্ষমাণ
<StatusBadge status="published"/>// 🔵 প্রকাশিত
```

## Modal & Form Components

### ConfirmModal.jsx
```jsx
// Can be opened from anywhere via uiStore
const {openConfirm} = useUiStore()
openConfirm({
  title: "ছাত্র মুছে ফেলবেন?",
  description: "এই কাজ পূর্বাবস্থায় ফেরানো যাবে না",
  type: "danger",  // danger | warning | info
  onConfirm: () => deleteStudent(id),
  loading: isDeleting,
})
```

### FileUpload.jsx
```jsx
// Props: accept, maxSize(MB), multiple, onUpload, preview
<FileUpload
  accept=".jpg,.png"
  maxSize={2}
  preview  // → ছবি preview দেখায়
  onUpload={(files) => handlePhoto(files[0])}
/>
// Drag-and-drop supported. Used for student photo and document upload.
```

### DateRangePicker.jsx
```jsx
// Props: value={from, to}, onChange, presets
<DateRangePicker
  value={dateRange}
  onChange={(range) => setDateRange(range)}
  presets  // → "এই মাস" / "এই বছর" / "গত মাস" shortcut বাটন
/>
// Used as the filter on all Report pages.
```

## Feedback Components

### Toast.jsx
```jsx
// From anywhere via uiStore
const {addToast} = useUiStore()
addToast("ছাত্র সফলভাবে যোগ হয়েছে", "success")  // সবুজ
addToast("কিছু একটা ভুল হয়েছে", "error")          // লাল
addToast("SMS পাঠানো হচ্ছে...", "info")            // নীল
addToast("মেয়াদ শেষ হচ্ছে!", "warning")           // হলুদ
// A single ToastContainer sits at the top in App.jsx
```

### EmptyState.jsx
```jsx
// Props: icon, title, description, action
<EmptyState
  icon="🎓"
  title="কোনো ছাত্র নেই"
  description="প্রথম ছাত্র ভর্তি করে শুরু করুন"
  action={<Button onClick={openAdd}>ভর্তি করুন</Button>}
/>
// Shows automatically in DataTable when data=[]
```

### Loader.jsx
```jsx
<Loader type="spinner"/>           // → বৃত্তাকার spinner
<Loader type="skeleton" rows={5}/> // → টেবিলের skeleton
<Loader type="page"/>              // → পুরো পেজ লোডার
// Auto-shows skeleton when DataTable loading={true}
```

## Print & Export Components

### PrintButton.jsx + usePrint hook
```jsx
// usePrint hook — blob download
const {download, loading} = usePrint()
const handlePrint = () => download(
  '/api/results/marksheet',
  'marksheet-raju.pdf',
  {student_id: 42, exam_id: 3}
)
// Click → axios blob → URL.createObjectURL → auto download

// PrintButton component (wrapper)
<PrintButton
  url="/api/results/marksheet"
  params={{student_id: 42, exam_id: 3}}
  filename="marksheet-raju.pdf"
  label="মার্কশিট প্রিন্ট"
/>
```

### ExportButton.jsx
```jsx
<ExportButton
  url="/api/reports/fees/export"
  format="excel"   // excel | csv
  params={{month: "2025-01", program_id: 3}}
  label="Excel ডাউনলোড"
/>
```

## Permission Component

### Can.jsx
```jsx
// Props: role (string | array), children, fallback
// Only admin will see this
<Can role="admin">
  <Button onClick={deleteStudent}>মুছুন</Button>
</Can>

// admin or teacher will see this
<Can role={["admin", "teacher"]}>
  <AttendanceTab/>
</Can>

// Others will see the fallback
<Can role="admin" fallback={<p>অ্যাক্সেস নেই</p>}>
  <SensitiveData/>
</Can>

// usePermission hook (used internally)
const {hasRole, can} = usePermission()
if (hasRole('admin')) { /* admin-only logic */ }
```

## Reusable Chart Components (recharts wrapper)

### charts/BarChart.jsx
```jsx
<BarChart
  data={monthlyFees}
  xKey="month"
  yKey="amount"
  title="মাসিক ফি কালেকশন"
  color="var(--color-primary)"
/>
```

### charts/LineChart.jsx
```jsx
// Growth trend, attendance pattern
<LineChart data={attendanceTrend} xKey="date" yKey="percentage"/>
```

### charts/DonutChart.jsx
```jsx
// Present/Absent/Late ratio
<DonutChart data={[{name:'Present', value:85}, {name:'Absent', value:15}]}/>
```

## Component Usage Summary
| Component | Which Pages |
|-----------|----------|
| DataTable | Students, Teachers, Fees, Results, Notices, Staff, Expenses |
| StatCard | সব Dashboard (Super Admin, Admin, Teacher, Accountant) |
| ConfirmModal | Delete student, Delete notice, Publish result, Issue TC |
| FileUpload | Student add/edit, Teacher add, Homework create, Materials upload |
| PrintButton | Marksheet, Receipt, ID Card, Salary Slip, TC |
| ExportButton | Student list, Fee report, Attendance, Salary report |
| DateRangePicker | Fee report, Attendance report, Revenue report |
| StatusBadge | Student list, Fee list, Exam list, Teacher list |
| Can | Admin-only delete buttons, Accountant-only salary tab |
| Toast | সব action-এর পর (create, update, delete, error) |
| EmptyState | প্রথমবার ব্যবহারে, search কিছু না পেলে |
| Loader | সব API loading state |
