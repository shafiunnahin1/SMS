import { lazy } from 'react'

// The default (classic) view of each page slot - docs/UI-PACKS.md section 3 "Page-view slots"
export const DEFAULT_VIEWS = {
  'attendance.take': lazy(() => import('../features/attendance/views/AttendanceTakeGrid')),
}
