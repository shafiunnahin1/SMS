// docs/UI-PACKS.md section 4 "Manifest". Spike S5b builds ONE alternative view (attendance.take, segmented) to measure the cost of a
// view; the other mobile views (students.list, students.quickAdd, fees.collect, dashboard) are phase C, after the owner's go-ahead.
export default {
  key: 'mobile',
  components: { tabs: 'underline', modal: 'sheet', stat_card: 'compact', list: 'cards' },
  views: {
    'attendance.take': () => import('./views/AttendanceTakeSegmented'),
  },
}
