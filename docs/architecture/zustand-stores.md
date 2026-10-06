# State Management (Zustand + React Query)

## Where Does Each State Live?
- Zustand: Global client state (token, user, institution, UI)
- React Query: Server state (API data, cache, loading)

## Zustand Stores

### authStore.js
```javascript
const useAuthStore = create(persist((set) => ({
  token: null,
  user: null,
  role: null,
  isAuthenticated: false,
  setAuth: (token, user) => set({ token, user, role: user.role, isAuthenticated: true }),
  clearAuth: () => set({ token: null, user: null, role: null, isAuthenticated: false }),
}), { name: 'auth-store' }))
```

### institutionStore.js
```javascript
const useInstitutionStore = create((set) => ({
  institution: null,
  academicYear: null,
  plan: null,
  setInstitution: (institution) => set({ institution }),
  setAcademicYear: (year) => set({ academicYear: year }),
}))
```

### uiStore.js
```javascript
const useUiStore = create((set) => ({
  sidebarOpen: true,
  toasts: [],
  confirmModal: null,
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  addToast: (msg, type='success') => set(s => ({
    toasts: [...s.toasts, { id: Date.now(), msg, type }]
  })),
  openConfirm: (config) => set({ confirmModal: config }),
  closeConfirm: () => set({ confirmModal: null }),
}))
```

## React Query Rules
- GET data: useQuery — cache থাকলে সাথে সাথে দেখায়
- POST/PUT/DELETE: useMutation → onSuccess: queryClient.invalidateQueries()
- Query Key: ['students', { program_id: 3, page: 1 }]
- Stale Time: Dashboard 1min, StudentList 5min, Attendance 0

## Example
```javascript
const { data, isLoading } = useQuery({
  queryKey: ['students', filters],
  queryFn: () => studentApi.getList(filters),
  staleTime: 5 * 60 * 1000,
})
```

---

## Revision 6 Note
`institutionStore`-এর চূড়ান্ত রূপ `docs/templates/react-core-files.md`-এ ("institutionStore.js — Full Code (Revision 6)") — এতে `/bootstrap` থেকে আসা `theme`, `terms`, `modules`, `plan`, `settings` থাকে। উপরের সংক্ষিপ্ত উদাহরণের বদলে সেটি ব্যবহার করুন। Server data (students, fees …) আগের নিয়মেই React Query-তে।
