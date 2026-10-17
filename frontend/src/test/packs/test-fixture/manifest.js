// docs/UI-PACKS.md section 12 / BUILD-SEQUENCE Step 3.6: a test-only pack. It overrides ONE view (attendance.take) and ONE
// component variant (stat_card -> compact, registered by PackRegistry.test.jsx); everything else falls back to the defaults.
// It is never in ui/packs.js, so no institution can select it.
export default {
  key: 'test-fixture',
  components: { tabs: 'underline', modal: 'dialog', stat_card: 'compact', list: 'table' },
  views: {
    'attendance.take': () => import('./views/AttendanceTakeFixture'),
  },
}

// The same pack with a view that forgot one action: PackContract.test.jsx must catch it
export const broken = {
  key: 'test-fixture-broken',
  components: {},
  views: {
    'attendance.take': () => import('./views/AttendanceTakeMissingReset'),
  },
}
