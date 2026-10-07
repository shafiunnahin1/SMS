import { resolveLocale } from '../ui/I18nProvider'

// Decision D53: user's locale -> remembered choice -> institution default -> bn; the browser's language is never used
describe('resolveLocale (D53)', () => {
  const enabled = ['bn', 'en']
  it('takes the user first, then the remembered choice, then the institution default', () => {
    expect(resolveLocale({ user: 'en', remembered: 'bn', institutionDefault: 'bn', enabled })).toBe('en')
    expect(resolveLocale({ user: null, remembered: 'en', institutionDefault: 'bn', enabled })).toBe('en')
    expect(resolveLocale({ user: null, remembered: null, institutionDefault: 'en', enabled })).toBe('en')
  })
  it('ignores values the institution has not enabled and falls back to bn', () => {
    expect(resolveLocale({ user: 'ar', remembered: 'fr', institutionDefault: 'ar', enabled })).toBe('bn')
  })
  it('an English browser does not change a Bangla institution', () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true })
    expect(resolveLocale({ user: null, remembered: null, institutionDefault: 'bn', enabled })).toBe('bn')
  })
})
