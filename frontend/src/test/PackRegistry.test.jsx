import { render, screen, cleanup } from '@testing-library/react'
import '../i18n'
import { UIProvider, useUI } from '../ui/UIProvider'
import { PACKS } from '../ui/packs'
import { COMPONENT_SLOTS, VIEW_SLOTS } from '../ui/slots'
import { DEFAULT_VIEWS } from '../ui/defaultViews'
import StatCard, { STAT_CARDS } from '../ui/variants/StatCard'
import Tabs from '../ui/variants/Tabs'
import Modal from '../ui/variants/Modal'
import List from '../ui/variants/List'
import { useInstitutionStore } from '../store/institutionStore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fixturePack from './packs/test-fixture/manifest'

// docs/TESTING.md "PackRegistryTest": unknown ui_pack -> classic; every manifest's components are valid variants; view keys come
// from the closed slot list; config/ui_packs.php has a manifest for every key and vice versa.
// The backend's pack list: config/ui_packs.php is a plain PHP array - read its top-level keys
const uiPacksPhp = readFileSync(resolve(__dirname, '../../../api/config/ui_packs.php'), 'utf8')
const configKeys = [...uiPacksPhp.matchAll(/^\s{4}'([a-z0-9-]+)'\s*=>/gm)].map(m => m[1])

function PackKey() { return <span>{useUI().key}</span> }

afterEach(() => { cleanup(); useInstitutionStore.setState({ theme: null }) })

it('an unknown or missing ui_pack is classic - never a blank page', () => {
  for (const ui_pack of ['nonsense', undefined, null, 'fresh']) {
    useInstitutionStore.setState({ theme: { ui_pack } })
    render(<UIProvider><PackKey /></UIProvider>)
    expect(screen.getByText('classic')).toBeInTheDocument()
    cleanup()
  }
  useInstitutionStore.setState({ theme: { ui_pack: 'mobile' } })
  render(<UIProvider><PackKey /></UIProvider>)
  expect(screen.getByText('mobile')).toBeInTheDocument()
})

it.each(Object.entries({ ...PACKS, 'test-fixture': fixturePack }))('manifest %s uses only known slots and variants', (key, pack) => {
  expect(pack.key).toBe(key)
  expect(Object.keys(pack.components).sort()).toEqual(Object.keys(COMPONENT_SLOTS).sort())
  for (const [slot, variant] of Object.entries(pack.components)) expect(COMPONENT_SLOTS[slot]).toContain(variant)
  for (const [slot, load] of Object.entries(pack.views)) {
    expect(VIEW_SLOTS).toContain(slot)
    expect(typeof load).toBe('function')
  }
})

it('the classic pack is the default variant of every slot and every built view slot has a default view', () => {
  expect(PACKS.classic.components).toEqual(Object.fromEntries(Object.entries(COMPONENT_SLOTS).map(([s, v]) => [s, v[0]])))
  for (const pack of Object.values(PACKS)) for (const slot of Object.keys(pack.views)) expect(DEFAULT_VIEWS[slot]).toBeDefined()
  Object.keys(DEFAULT_VIEWS).forEach(slot => expect(VIEW_SLOTS).toContain(slot))
})

it('config/ui_packs.php and the frontend registry list the same packs', () => {
  expect(configKeys.length).toBeGreaterThan(0)
  expect([...configKeys].sort()).toEqual(Object.keys(PACKS).sort())
})

it('a pack overrides a component variant; a variant not built yet falls back to the default', () => {
  STAT_CARDS.compact = ({ label, value }) => <p data-variant="compact">{label}: {value}</p>   // registered for the test-fixture pack only
  try {
    const { container } = render(<UIProvider pack={fixturePack}><StatCard label="Students" value="12" /></UIProvider>)
    expect(container.querySelector('[data-variant="compact"]')).not.toBeNull()
    cleanup()
    const classic = render(<UIProvider pack={PACKS.classic}><StatCard label="Students" value="12" /></UIProvider>)
    expect(classic.container.querySelector('[data-variant="compact"]')).toBeNull()
    expect(screen.getByText('Students')).toBeInTheDocument()
  } finally {
    delete STAT_CARDS.compact
  }
  cleanup()
  const { container } = render(<UIProvider pack={fixturePack}><StatCard label="Students" value="12" /></UIProvider>)
  expect(container.querySelector('[data-tone]')).not.toBeNull()   // compact unbuilt -> bar
})

it('the default variants keep their section 6 contracts', async () => {
  const onChange = vi.fn()
  render(<UIProvider><Tabs items={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B', badge: 3 }]} value="a" onChange={onChange} /></UIProvider>)
  expect(screen.getByRole('tablist')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true')
  screen.getByRole('tab', { name: 'A' }).focus()
  screen.getByRole('tablist').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  expect(onChange).toHaveBeenCalledWith('b')
  cleanup()

  const onClose = vi.fn()
  render(<UIProvider><Modal open onClose={onClose} title="T" actions={<button type="button">ok</button>}>body</Modal></UIProvider>)
  expect(screen.getByRole('dialog', { name: 'T' })).toBeInTheDocument()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(onClose).toHaveBeenCalled()
  cleanup()
  render(<UIProvider><Modal open={false} onClose={onClose} title="T">body</Modal></UIProvider>)
  expect(screen.queryByRole('dialog')).toBeNull()
  cleanup()

  render(<UIProvider><List columns={[{ key: 'name', label: 'Name', primary: true }]} rows={[{ id: 1, name: 'রাহিম' }]} /></UIProvider>)
  expect(screen.getAllByText('রাহিম').length).toBeGreaterThan(0)
})
