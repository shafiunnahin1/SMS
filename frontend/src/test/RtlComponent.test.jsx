import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '../i18n'
import { UIProvider } from '../ui/UIProvider'
import { COMPONENT_SLOTS } from '../ui/slots'
import Tabs, { TABS } from '../ui/variants/Tabs'
import Modal, { MODALS } from '../ui/variants/Modal'
import StatCard, { STAT_CARDS } from '../ui/variants/StatCard'
import List, { LISTS } from '../ui/variants/List'
import DirIcon from '../components/DirIcon'
import LanguageSwitcher from '../layouts/parts/LanguageSwitcher'
import { I18nProvider } from '../ui/I18nProvider'
import { useInstitutionStore } from '../store/institutionStore'

// docs/I18N.md section 14 "RtlComponentTest": under dir=rtl every built ui/variants/* variant and the LanguageSwitcher render; DirIcon
// gets its mirror class; arrow keys follow the reading direction. (R1 ships no Arabic text - the RTL foundation is tested with dir alone.)
const MAPS = { tabs: TABS, modal: MODALS, stat_card: STAT_CARDS, list: LISTS }
const ITEMS = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }]

afterEach(() => { cleanup(); document.documentElement.dir = 'ltr' })

describe.each(['ltr', 'rtl'])('%s', (dir) => {
  beforeEach(() => { document.documentElement.dir = dir })

  it.each(Object.keys(COMPONENT_SLOTS))('every built %s variant renders', (slot) => {
    for (const variant of Object.keys(MAPS[slot])) {
      const pack = { key: 't', components: { [slot]: variant }, views: {} }
      const el = {
        tabs: <Tabs items={ITEMS} value="a" onChange={() => {}} />,
        modal: <Modal open onClose={() => {}} title="T">body</Modal>,
        stat_card: <StatCard label="L" value="1" delta={5} />,
        list: <List columns={[{ key: 'name', label: 'N', primary: true }]} rows={[{ id: 1, name: 'রাহিম' }]} />,
      }[slot]
      const { container } = render(<UIProvider pack={pack}>{el}</UIProvider>)
      expect(container.innerHTML).not.toBe('')
      cleanup()
    }
  })

  it('the LanguageSwitcher shows each enabled language in its own script', () => {
    useInstitutionStore.setState({ locales: { default: 'bn', enabled: ['bn', 'en'] } })
    render(<I18nProvider><LanguageSwitcher /></I18nProvider>)
    expect(screen.getByRole('option', { name: 'বাংলা' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument()
  })
})

it('DirIcon carries the mirror class so it flips under rtl', () => {
  const { container } = render(<div dir="rtl"><DirIcon icon="next" /></div>)
  expect(container.querySelector('svg').getAttribute('class')).toContain('rtl:-scale-x-100')
})

it('arrow keys follow the reading direction in Tabs', () => {
  const onChange = vi.fn()
  const { rerender } = render(<div dir="ltr"><Tabs items={ITEMS} value="b" onChange={onChange} /></div>)
  fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
  expect(onChange).toHaveBeenLastCalledWith('c')
  rerender(<div dir="rtl"><Tabs items={ITEMS} value="b" onChange={onChange} /></div>)
  fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
  expect(onChange).toHaveBeenLastCalledWith('a')
  fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
  expect(onChange).toHaveBeenLastCalledWith('c')
})
