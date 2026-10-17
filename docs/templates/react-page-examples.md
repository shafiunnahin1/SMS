# React Page Code Examples

## pages/admin/Dashboard.jsx
```jsx
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import StatCard from '../../components/common/StatCard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Loader from '../../components/common/Loader'

const fetchDashboard = () => api.get('/admin/dashboard').then(r => r.data.data)

export default function AdminDashboard() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: fetchDashboard,
    staleTime: 60 * 1000,
  })

  if (isLoading) return <Loader type="page" />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-content">ড্যাশবোর্ড</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="মোট ছাত্র"   value={data.total_students}  icon="🎓" color="blue"   trend={data.student_trend} />
        <StatCard title="মোট শিক্ষক"  value={data.total_teachers}  icon="👨‍🏫" color="green"  />
        <StatCard title="আজকের উপস্থিতি" value={`${data.today_attendance}%`} icon="📅" color="teal" />
        <StatCard title="মাসিক বকেয়া" value={`৳${data.monthly_dues?.toLocaleString()}`} icon="💵" color="red" />
      </div>

      {/* Fee Collection Chart */}
      <div className="bg-surface rounded-token border border-line p-density">
        <h2 className="text-base font-medium text-content mb-4">মাসিক ফি কালেকশন (৳)</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.monthly_fee_chart}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => `৳${v.toLocaleString()}`} />
            <Bar dataKey="amount" fill="var(--color-primary)" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Activity */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent Payments */}
        <div className="bg-surface rounded-token border border-line p-density">
          <h2 className="text-base font-medium text-content mb-3">সর্বশেষ পেমেন্ট</h2>
          <div className="space-y-2">
            {data.recent_payments?.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-content">{p.student_name}</p>
                  <p className="text-content-muted text-xs">{p.fee_category} — {p.paid_at}</p>
                </div>
                <span className="text-green-600 font-semibold">৳{p.paid_amount}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notices */}
        <div className="bg-surface border p-density">
          <h2 className="text-base font-medium text-content mb-3">সর্বশেষ নোটিশ</h2>
          <div className="space-y-2">
            {data.recent_notices?.map(n => (
              <div key={n.id} className="text-sm py-2 border-b last:border-0">
                <p className="font-medium text-content">{n.title}</p>
                <p className="text-content-muted text-xs">{n.published_at}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

## pages/admin/students/StudentList.jsx
```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../../api/axios'
import DataTable from '../../../components/common/DataTable'
import StatusBadge from '../../../components/common/StatusBadge'
import PageHeader from '../../../components/common/PageHeader'
import Can from '../../../components/common/Can'
import { useUiStore } from '../../../store/uiStore'

const fetchStudents = (filters) =>
  api.get('/students', { params: filters }).then(r => r.data)

export default function StudentList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast, openConfirm } = useUiStore()

  const [filters, setFilters] = useState({ page: 1, per_page: 20, program_id: '', search: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['students', filters],
    queryFn: () => fetchStudents(filters),
    keepPreviousData: true,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/students/${id}`),
    onSuccess: () => {
      addToast('ছাত্র নিষ্ক্রিয় করা হয়েছে', 'success')
      queryClient.invalidateQueries({ queryKey: ['students'] })
    },
  })

  const handleDelete = (student) => {
    openConfirm({
      title: 'ছাত্র নিষ্ক্রিয় করবেন?',
      description: `${student.name}-কে নিষ্ক্রিয় করলে সে আর লগিন করতে পারবে না।`,
      type: 'danger',
      onConfirm: () => deleteMutation.mutate(student.id),
    })
  }

  const columns = [
    { key: 'student_id', label: 'আইডি', render: r => <span className="font-mono text-xs text-primary-fg">{r.student_id}</span> },
    { key: 'name',       label: 'নাম' },
    { key: 'batch',      label: t('batch'), render: r => `${r.program} (${r.batch})` },   // t = useTerms()
    { key: 'roll_no',    label: 'রোল' },
    { key: 'guardian_phone', label: 'অভিভাবক' },
    { key: 'status',     label: 'অবস্থা', render: r => <StatusBadge status={r.status} /> },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="ছাত্র তালিকা"
        breadcrumbs={[{ label: 'Dashboard', path: '/admin' }, { label: 'ছাত্র' }]}
        actions={
          <Can role="admin">
            <button
              onClick={() => navigate('/admin/students/add')}
              className="bg-primary text-on-primary px-4 py-2 rounded-token text-sm font-medium hover:opacity-90"
            >
              + ভর্তি করুন
            </button>
          </Can>
        }
      />

      {/* Filters */}
      <div className="bg-surface p-density border border-line flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="নাম বা আইডি দিয়ে সার্চ..."
          className="border px-3 py-2 text-sm flex-1 min-w-[200px]"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
        />
        <select
          className="border px-3 py-2 text-sm"
          value={filters.program_id}
          onChange={e => setFilters(f => ({ ...f, program_id: e.target.value, page: 1 }))}
        >
          <option value="">সব শ্রেণী</option>
          {/* classes list from API */}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data || []}
        loading={isLoading}
        onRowClick={(row) => navigate(`/admin/students/${row.id}`)}
        pagination={{
          page: filters.page,
          total: data?.meta?.total || 0,
          perPage: filters.per_page,
          onChange: (page) => setFilters(f => ({ ...f, page })),
        }}
        actions={(row) => (
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/admin/students/${row.id}`) }}
              className="text-primary-fg hover:underline text-xs"
            >
              দেখুন
            </button>
            <Can role="admin">
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(row) }}
                className="text-red-600 hover:underline text-xs"
              >
                নিষ্ক্রিয়
              </button>
            </Can>
          </div>
        )}
      />
    </div>
  )
}
```

## components/common/DataTable.jsx
```jsx
import { useState } from 'react'
import Loader from './Loader'
import EmptyState from './EmptyState'

export default function DataTable({
  columns, data, loading, pagination,
  onRowClick, actions, searchable,
}) {
  const [localSearch, setLocalSearch] = useState('')

  const filtered = searchable
    ? data.filter(row =>
        Object.values(row).some(v =>
          String(v).toLowerCase().includes(localSearch.toLowerCase())
        )
      )
    : data

  if (loading) return <Loader type="skeleton" rows={8} />

  return (
    <div className="bg-surface rounded-token border border-line overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-line">
          <input
            type="text"
            placeholder="সার্চ করুন..."
            className="w-full border px-3 py-2 text-sm"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-primary text-on-primary">
            <tr>
              {columns.map(col => (
                <th key={col.key} className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">
                  {col.label}
                </th>
              ))}
              {actions && <th className="px-4 py-3 text-start font-medium text-xs uppercase">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="py-12">
                  <EmptyState icon="🔍" title="কোনো তথ্য পাওয়া যায়নি" />
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr
                  key={row.id || i}
                  onClick={() => onRowClick?.(row)}
                  className={`hover:bg-primary-soft transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-content">
                      {col.render ? col.render(row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {actions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.total > pagination.perPage && (
        <div className="px-4 py-3 border-t border-line flex items-center justify-between">
          <p className="text-xs text-content-muted">
            মোট {pagination.total} টি রেকর্ড
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => pagination.onChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 rounded-token border text-xs disabled:opacity-40 hover:bg-surface-muted"
            >
              ← আগে
            </button>
            <span className="px-3 py-1.5 text-xs text-content-muted">
              {pagination.page} / {Math.ceil(pagination.total / pagination.perPage)}
            </span>
            <button
              onClick={() => pagination.onChange(pagination.page + 1)}
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.perPage)}
              className="px-3 py-1.5 border text-xs disabled:opacity-40 hover:bg-surface-muted"
            >
              পরে →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

## hooks/usePrint.js
```javascript
import { useState } from 'react'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'

export function usePrint() {
  const [loading, setLoading] = useState(false)
  const { addToast } = useUiStore()

  const download = async (url, filename, params = {}) => {
    setLoading(true)
    try {
      const response = await api.get(url, {
        params,
        responseType: 'blob',
        timeout: 30000,
      })
      const contentType = response.headers['content-type']
      const blob = new Blob([response.data], { type: contentType })
      const blobUrl = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)

      addToast('ফাইল ডাউনলোড শুরু হয়েছে', 'success')
    } catch (error) {
      addToast('ফাইল ডাউনলোড করতে সমস্যা হয়েছে', 'error')
      console.error('Print error:', error)
    } finally {
      setLoading(false)
    }
  }

  const preview = async (url, params = {}) => {
    setLoading(true)
    try {
      const response = await api.get(url, { params, responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const blobUrl = URL.createObjectURL(blob)
      window.open(blobUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch {
      addToast('PDF লোড করতে সমস্যা হয়েছে', 'error')
    } finally {
      setLoading(false)
    }
  }

  return { download, preview, loading }
}
```

---

## pages/auth/Login.jsx — Full Code
```jsx
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useInstitutionStore } from '../../store/institutionStore'

const schema = z.object({
  login:    z.string().min(3, 'ইমেইল, ফোন নম্বর বা Student ID লিখুন'),   // R6: email | phone | student ID
  password: z.string().min(6, 'Password min 6 characters'),
})

const ROLE_HOME = {
  super_admin: '/super-admin/dashboard',
  admin:       '/admin/dashboard',
  teacher:     '/teacher/dashboard',
  student:     '/student/dashboard',
  parent:      '/parent/dashboard',
  accountant:  '/accountant/dashboard',
}

export default function Login() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const setAuth   = useAuthStore(s => s.setAuth)
  const setInstitution = useInstitutionStore(s => s.setInstitution)
  const [show2FA, setShow2FA] = useState(false)
  const [userId,  setUserId]  = useState(null)
  const [otp,     setOtp]     = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const loginMutation = useMutation({
    mutationFn: (data) => api.post('/auth/login', data),
    onSuccess: (res) => {
      const { token, user, institution, error } = res.data

      if (error === '2fa_required') {
        setUserId(res.data.user_id)
        setShow2FA(true)
        return
      }

      setAuth(token, user)
      if (institution) setInstitution(institution)

      const from = location.state?.from?.pathname
      navigate(from || ROLE_HOME[user.role] || '/login', { replace: true })
    },
  })

  const otpMutation = useMutation({
    mutationFn: () => api.post('/auth/verify-otp', { user_id: userId, otp }),
    onSuccess: (res) => {
      const { token, user, institution } = res.data
      setAuth(token, user)
      if (institution) setInstitution(institution)
      navigate(ROLE_HOME[user.role] || '/login', { replace: true })
    },
  })

  if (show2FA) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center p-4">
        <div className="bg-surface rounded-token shadow-lg p-8 w-full max-w-sm">
          <h2 className="text-xl font-bold text-content mb-2 text-center">Verify OTP</h2>
          <p className="text-sm text-content-muted text-center mb-6">
            Enter the 6-digit code sent to your phone
          </p>
          <input
            type="text" maxLength={6} value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full border border-line rounded-token px-4 py-3 text-center
                       text-2xl tracking-widest font-mono focus:outline-none focus:ring-2
                       focus:ring-primary-fg mb-4"
          />
          <button
            onClick={() => otpMutation.mutate()}
            disabled={otp.length < 6 || otpMutation.isPending}
            className="w-full bg-primary text-on-primary py-3 font-medium
                       hover:opacity-90 disabled:opacity-50"
          >
            {otpMutation.isPending ? 'Verifying...' : 'Verify'}
          </button>
          {otpMutation.isError && (
            <p className="text-red-500 text-sm text-center mt-3">
              Invalid or expired OTP
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary to-primary
                    flex items-center justify-center p-4">
      <div className="bg-surface rounded-token shadow-2xl p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-token flex items-center justify-center
                          mx-auto mb-3 text-on-primary text-2xl">🏫</div>
          <h1 className="text-2xl font-bold text-content">Education Management</h1>
          <p className="text-content-muted text-sm mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">Email</label>
            <input
              {...register('login')}
              type="text" inputMode="email" autoComplete="username"
              placeholder="ইমেইল / ফোন / Student ID"
              className="w-full border px-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-fg
                         focus:border-transparent"
            />
            {errors.login && (
              <p className="text-red-500 text-xs mt-1">{errors.login.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-content mb-1">Password</label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className="w-full border px-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-fg"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          <div className="flex justify-end">
            <button type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-primary-fg text-sm hover:underline">
              Forgot password?
            </button>
          </div>

          {loginMutation.isError && (
            <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {loginMutation.error?.response?.data?.message || 'Login failed'}
            </div>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full bg-primary text-on-primary py-3 font-medium
                       hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-content-muted mt-6">
          Education Management SaaS — Powered by React + Laravel
        </p>
      </div>
    </div>
  )
}
```

---

## components/common/NotificationBell.jsx
```jsx
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import api from '../../api/axios'
import { formatDistanceToNow } from 'date-fns'

const fetchNotifications = () =>
  api.get('/notifications').then(r => r.data.data)

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref  = useRef(null)
  const queryClient = useQueryClient()

  const { data = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn:  fetchNotifications,
    refetchInterval: 30000, // poll every 30 seconds
  })

  const unread = data.filter(n => !n.read_at).length

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const typeIcon = (type) => ({
    absent_alert:    '🔴',
    fee_reminder:    '💵',
    result_published:'📝',
    notice:          '📢',
    homework:        '📚',
    default:         '🔔',
  })[type] || '🔔'

  return (
    <div className="relative" ref={ref}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-token hover:bg-surface-muted transition-colors"
      >
        <Bell size={20} className="text-content-muted" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white
                           text-xs rounded-full flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute end-0 top-full mt-2 w-80 bg-surface shadow-xl
                        border border-line z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-content text-sm">
              Notifications {unread > 0 && <span className="text-red-500">({unread})</span>}
            </h3>
            {unread > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-primary-fg hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-line">
            {data.length === 0 ? (
              <div className="px-4 py-8 text-center text-content-muted text-sm">
                No notifications
              </div>
            ) : (
              data.slice(0, 15).map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.read_at && markRead.mutate(n.id)}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-muted transition-colors
                              ${!n.read_at ? 'bg-primary-soft' : ''}`}
                >
                  <div className="flex gap-3">
                    <span className="text-lg flex-shrink-0">{typeIcon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.read_at ? 'font-medium text-content' : 'text-content-muted'}`}>
                        {n.data?.message || n.data?.title}
                      </p>
                      <p className="text-xs text-content-muted mt-0.5">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.read_at && (
                      <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {data.length > 15 && (
            <div className="px-4 py-2 border-t border-line text-center">
              <button className="text-xs text-primary-fg hover:underline">
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

---

## pages/accountant/FeeCollection.jsx — Full Code
```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { usePrint } from '../../hooks/usePrint'
import PageHeader from '../../components/common/PageHeader'
import StatusBadge from '../../components/common/StatusBadge'

const searchStudent = (q) =>
  api.get('/students', { params: { search: q, per_page: 10 } }).then(r => r.data.data)

const getStudentDues = (id) =>
  api.get(`/fees/payments/student/${id}`).then(r => r.data.data)

export default function FeeCollection() {
  const [query,     setQuery]     = useState('')
  const [student,   setStudent]   = useState(null)
  const [dues,      setDues]      = useState([])
  const [selected,  setSelected]  = useState([])
  const [method,    setMethod]    = useState('cash')
  const [discount,  setDiscount]  = useState(0)
  const [searching, setSearching] = useState(false)
  const [results,   setResults]   = useState([])

  const { addToast } = useUiStore()
  const { download, loading: printing } = usePrint()
  const queryClient = useQueryClient()

  const handleSearch = async (q) => {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    const data = await searchStudent(q)
    setResults(data)
    setSearching(false)
  }

  const handleSelectStudent = async (s) => {
    setStudent(s)
    setResults([])
    setQuery(s.name)
    setSelected([])
    const data = await getStudentDues(s.id)
    setDues(data.dues || [])
  }

  // Revision 6.2: the manual 'discount' input below is no longer sent - remove the field (waivers go through the approval flow).
  // dues come from GET /fees/dues?student_id= as lines with a stable `key`; the client never sends an amount or a discount
  // (waivers / sibling discount are applied server-side). Optional per-line `paid_amount` = partial payment (<= line amount).
  const totalSelected = dues
    .filter(d => selected.includes(d.key))
    .reduce((sum, d) => sum + d.amount, 0)
  const finalAmount = totalSelected

  const collectMutation = useMutation({
    mutationFn: () => api.post('/fees/collect', {
      student_id: student.id,
      lines:      selected.map(key => ({ key })),
      payment_method: method,
    }),
    onSuccess: async (res) => {
      addToast('Fee collected successfully!', 'success')
      await download('/fees/receipt/' + res.data.data[0].receipt_no, `receipt-${res.data.data[0].receipt_no}.pdf`)
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setStudent(null); setDues([]); setSelected([]); setQuery(''); setDiscount(0)
    },
  })

  const METHODS = [
    { value: 'cash',          label: 'Cash',          icon: '💵' },
    { value: 'bkash',         label: 'bKash',         icon: '📱' },
    { value: 'nagad',         label: 'Nagad',         icon: '📲' },
    { value: 'card',          label: 'Card',          icon: '💳' },
    { value: 'bank_transfer', label: 'Bank Transfer', icon: '🏦' },
    { value: 'cheque',        label: 'Cheque',        icon: '📄' },
  ]

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader
        title="Fee Collection"
        breadcrumbs={[{ label: 'Dashboard', path: '/accountant' }, { label: 'Fee Collection' }]}
      />

      {/* Student Search */}
      <div className="bg-surface rounded-token border border-line p-density">
        <label className="block text-sm font-medium text-content mb-2">
          Search Student
        </label>
        <div className="relative">
          <input
            type="text" value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Type name or student ID..."
            className="w-full border px-4 py-3 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-fg"
          />
          {searching && (
            <div className="absolute end-3 top-3.5">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent
                              rounded-full animate-spin"/>
            </div>
          )}
          {results.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-surface border border-line
                            shadow-lg z-10 overflow-hidden">
              {results.map(s => (
                <button key={s.id} onClick={() => handleSelectStudent(s)}
                  className="w-full px-4 py-3 text-start hover:bg-primary-soft text-sm
                             flex items-center justify-between border-b border-line">
                  <div>
                    <p className="font-medium text-content">{s.name}</p>
                    <p className="text-content-muted text-xs">
                      {s.student_id} • {s.program} {s.batch}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Student Info + Dues */}
      {student && (
        <>
          <div className="bg-primary-soft border border-primary p-density flex gap-4 items-center">
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center
                            text-on-primary font-bold text-lg">
              {student.name[0]}
            </div>
            <div>
              <p className="font-semibold text-content">{student.name}</p>
              <p className="text-sm text-content-muted">
                {student.student_id} • {student.program} {student.batch} • Roll: {student.roll_no}
              </p>
              <p className="text-sm text-content-muted">Guardian: {student.guardian_phone}</p>
            </div>
          </div>

          {/* Due List */}
          <div className="bg-surface border overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h3 className="font-medium text-content">Due Fees</h3>
              {dues.length > 0 && (
                <button
                  onClick={() => setSelected(selected.length === dues.length
                    ? [] : dues.map(d => d.key))}
                  className="text-xs text-primary-fg hover:underline"
                >
                  {selected.length === dues.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            {dues.length === 0 ? (
              <div className="py-10 text-center text-content-muted text-sm">
                ✅ No pending fees
              </div>
            ) : (
              dues.map(due => (
                <label key={due.key}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted
                             cursor-pointer border-b border-line">
                  <input
                    type="checkbox"
                    checked={selected.includes(due.key)}
                    onChange={e => setSelected(
                      e.target.checked
                        ? [...selected, due.key]
                        : selected.filter(k => k !== due.key)
                    )}
                    className="w-4 h-4 rounded text-primary-fg"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-content">{due.category}</p>
                    <p className="text-xs text-content-muted">{due.period}</p>
                  </div>
                  <span className="text-sm font-semibold text-content">
                    BDT {due.amount.toLocaleString()}
                  </span>
                  <StatusBadge status="due" />
                </label>
              ))
            )}
          </div>

          {/* Payment Form */}
          {selected.length > 0 && (
            <div className="bg-surface border space-y-4">
              <h3 className="font-medium text-content">Payment Details</h3>

              {/* Payment Method */}
              <div>
                <label className="block text-sm text-content-muted mb-2">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map(m => (
                    <button key={m.value} onClick={() => setMethod(m.value)}
                      className={`border rounded-token py-2 px-3 text-sm flex items-center gap-2
                                  transition-colors ${method === m.value
                                    ? 'border-primary bg-primary-soft text-primary-fg'
                                    : 'border-line text-content-muted hover:bg-surface-muted'}`}>
                      <span>{m.icon}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Discount */}
              <div>
                <label className="block text-sm text-content-muted mb-1">Discount (BDT)</label>
                <input
                  type="number" min="0" value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  className="w-full border border-line rounded-token px-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary-fg"
                />
              </div>

              {/* Summary */}
              <div className="bg-surface-muted p-4 space-y-2 text-sm">
                <div className="flex justify-between text-content-muted">
                  <span>Selected ({selected.length} items)</span>
                  <span>BDT {totalSelected.toLocaleString()}</span>
                </div>
                {Number(discount) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>- BDT {Number(discount).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-content border-t
                                pt-2">
                  <span>Total Payable</span>
                  <span className="text-primary-fg text-base">
                    BDT {finalAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => collectMutation.mutate()}
                disabled={collectMutation.isPending || finalAmount <= 0}
                className="w-full bg-green-600 text-white py-3 font-medium
                           hover:bg-green-700 disabled:opacity-50 flex items-center
                           justify-center gap-2"
              >
                {collectMutation.isPending
                  ? '⏳ Processing...'
                  : `✅ Collect BDT ${finalAmount.toLocaleString()}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

---

## pages/teacher/Attendance.jsx — Full Code
```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/common/PageHeader'

const STATUS_OPTIONS = [
  { value: 'present', label: 'P', color: 'bg-green-500 text-white' },
  { value: 'absent',  label: 'A', color: 'bg-red-500 text-white'   },
  { value: 'late',    label: 'L', color: 'bg-yellow-500 text-white' },
  { value: 'leave',   label: 'V', color: 'bg-accent text-white' },
]

export default function TeacherAttendance() {
  const today = new Date().toISOString().split('T')[0]
  const [date,      setDate]      = useState(today)
  const [programId,   setClassId]   = useState('')
  const [batchId, setBatchId] = useState('')
  const [records,   setRecords]   = useState({}) // { studentId: status }
  const [submitted, setSubmitted] = useState(false)

  const { addToast, openConfirm } = useUiStore()
  const queryClient = useQueryClient()

  // Load teacher's classes
  const { data: myClasses = [] } = useQuery({
    queryKey: ['teacher-batches'],
    queryFn: () => api.get('/teacher/batches').then(r => r.data.data),
  })

  // Load students when class selected
  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['students', programId, batchId],
    queryFn:  () => api.get('/students', {
      params: { program_id: programId, batch_id: batchId || undefined, per_page: 100 }
    }).then(r => r.data.data),
    enabled: !!programId,
    onSuccess: (data) => {
      // Default: all present
      const init = {}
      data.forEach(s => { init[s.id] = 'present' })
      setRecords(init)
      setSubmitted(false)
    },
  })

  const submitMutation = useMutation({
    mutationFn: () => api.post('/attendance', {
      program_id:   programId,
      batch_id: batchId || null,
      date,
      records: Object.entries(records).map(([student_id, status]) =>
        ({ student_id: Number(student_id), status })
      ),
    }),
    onSuccess: () => {
      addToast('Attendance saved successfully!', 'success')
      setSubmitted(true)
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    },
  })

  const setAll = (status) => {
    const all = {}
    students.forEach(s => { all[s.id] = status })
    setRecords(all)
  }

  const toggle = (studentId, status) => {
    setRecords(prev => ({ ...prev, [studentId]: status }))
  }

  const counts = students.reduce((acc, s) => {
    const st = records[s.id] || 'present'
    acc[st] = (acc[st] || 0) + 1
    return acc
  }, {})

  const handleSubmit = () => {
    openConfirm({
      title: 'Save Attendance?',
      description: `${counts.present || 0} present, ${counts.absent || 0} absent on ${date}`,
      type: 'info',
      onConfirm: () => submitMutation.mutate(),
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Take Attendance"
        breadcrumbs={[{ label: 'Dashboard', path: '/teacher' }, { label: 'Attendance' }]}
      />

      {/* Filters */}
      <div className="bg-surface rounded-token border border-line p-density">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">Date</label>
            <input type="date" value={date} max={today}
              onChange={e => setDate(e.target.value)}
              className="w-full border px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-fg"/>
          </div>
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">{t('program')}</label>
            <select value={programId} onChange={e => { setClassId(e.target.value); setBatchId('') }}
              className="w-full border px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-fg">
              <option value="">Select Class</option>
              {myClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">{t('batch')}</label>
            <select value={batchId} onChange={e => setBatchId(e.target.value)}
              className="w-full border px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-fg"
              disabled={!programId}>
              <option value="">All Batches</option>
              {myClasses.find(c => c.id == programId)?.batches?.map(s => (
                <option key={s.id} value={s.id}>Batch {s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Student List */}
      {programId && (
        <div className="bg-surface border overflow-hidden">
          {/* Summary + Quick Actions */}
          <div className="px-5 py-3 border-b flex items-center justify-between
                          flex-wrap gap-2">
            <div className="flex gap-3 text-sm">
              <span className="text-green-600 font-medium">✅ {counts.present || 0} Present</span>
              <span className="text-red-500 font-medium">❌ {counts.absent || 0} Absent</span>
              {counts.late > 0 && <span className="text-yellow-500 font-medium">⏰ {counts.late} Late</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAll('present')}
                className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-token
                           font-medium hover:bg-green-200">
                All Present
              </button>
              <button onClick={() => setAll('absent')}
                className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-token
                           font-medium hover:bg-red-200">
                All Absent
              </button>
            </div>
          </div>

          {/* Student Rows */}
          <div className="divide-y divide-line">
            {loadingStudents ? (
              Array.from({length: 5}).map((_, i) => (
                <div key={i} className="px-5 py-3 animate-pulse flex items-center gap-3">
                  <div className="w-8 h-8 bg-line rounded-full"/>
                  <div className="flex-1 h-4 bg-line rounded"/>
                  <div className="w-40 h-8 bg-line rounded"/>
                </div>
              ))
            ) : students.map(s => (
              <div key={s.id} className="px-5 py-3 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary-soft rounded-full flex items-center
                                 justify-center text-primary-fg font-medium text-sm flex-shrink-0">
                  {s.roll_no}
                </span>
                <p className="flex-1 text-sm font-medium text-content">{s.name}</p>
                <div className="flex gap-1">
                  {STATUS_OPTIONS.map(opt => (
                    <button key={opt.value}
                      onClick={() => toggle(s.id, opt.value)}
                      className={`w-8 h-8 rounded-token text-xs font-bold transition-all
                                  ${records[s.id] === opt.value
                                    ? opt.color + ' scale-110 shadow-sm'
                                    : 'bg-surface-muted text-content-muted hover:bg-line'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Submit */}
          {students.length > 0 && !submitted && (
            <div className="px-5 py-4 border-t border-line">
              <button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                className="w-full bg-primary text-on-primary py-3 rounded-token font-medium
                           hover:opacity-90 disabled:opacity-50"
              >
                {submitMutation.isPending ? '⏳ Saving...' : '✅ Save Attendance'}
              </button>
            </div>
          )}

          {submitted && (
            <div className="px-5 py-4 border-t border-line">
              <div className="bg-green-50 border border-green-200 py-3
                              text-center text-green-700 font-medium text-sm">
                ✅ Attendance saved for {date}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```
