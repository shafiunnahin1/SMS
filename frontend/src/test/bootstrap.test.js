import { vi, beforeEach } from 'vitest'

// Step 3.1 Done When: loading the app calls /bootstrap ONCE and fills the store; the central host sets isCentral
vi.mock('../api/axios', () => ({ bindAuthStore: () => {}, default: { get: vi.fn() } }))
const { default: api } = await import('../api/axios')
const { useInstitutionStore, readCachedBootstrap } = await import('../store/institutionStore')

const TENANT = { success: true, data: { is_central: false, institution: { id: 2, slug: 'alokito-coaching' }, terms: { batch: { bn: 'ব্যাচ' } },
  modules: ['students', 'fees'], roles: ['admin'], theme: { primary_color: '#0F766E', tokens: {} }, settings: { use_programs: true },
  locales: { default: 'bn', enabled: ['bn', 'en'] }, release: { id: 'R1' } } }

beforeEach(() => { api.get.mockReset(); localStorage.clear(); useInstitutionStore.setState({ ready: false, isCentral: false, modules: [], institution: null }) })

it('calls /bootstrap once, fills the store and caches it for the next visit (no theme flash)', async () => {
  api.get.mockResolvedValue({ data: TENANT })
  await useInstitutionStore.getState().loadBootstrap()
  expect(api.get).toHaveBeenCalledTimes(1)
  expect(api.get).toHaveBeenCalledWith('/bootstrap')
  const s = useInstitutionStore.getState()
  expect([s.ready, s.isCentral, s.institution.slug, s.hasModule('fees'), s.hasModule('hostel')]).toEqual([true, false, 'alokito-coaching', true, false])
  expect(readCachedBootstrap().theme.primary_color).toBe('#0F766E')
})

it('the central host says isCentral', async () => {
  api.get.mockResolvedValue({ data: { success: true, data: { is_central: true, theme: { tokens: {} }, locales: { default: 'bn', enabled: ['bn', 'en'] } } } })
  await useInstitutionStore.getState().loadBootstrap()
  expect(useInstitutionStore.getState().isCentral).toBe(true)
})

it('a failed bootstrap without a cached copy is an error state, with a cached copy the app keeps working', async () => {
  api.get.mockRejectedValue(new Error('down'))
  await useInstitutionStore.getState().loadBootstrap()
  expect(useInstitutionStore.getState().error).toBeTruthy()
  api.get.mockResolvedValueOnce({ data: TENANT }); useInstitutionStore.setState({ error: null })
  await useInstitutionStore.getState().loadBootstrap()
  api.get.mockRejectedValue(new Error('down again')); useInstitutionStore.setState({ ready: false })
  await useInstitutionStore.getState().loadBootstrap()
  expect([useInstitutionStore.getState().ready, useInstitutionStore.getState().error]).toEqual([true, null])
})
