import { GOOGLE_FAMILIES, loadFont } from '../theme/fonts'

// Decision D52: Google Fonts, one stylesheet per family, display=swap, nothing for an unknown key
it('loads each chosen family once from Google Fonts with display=swap', () => {
  loadFont('baloo-da-2'); loadFont('baloo-da-2'); loadFont('unknown-font')
  const links = [...document.head.querySelectorAll('link[rel=stylesheet][data-font]')].map(l => l.getAttribute('href'))
  expect(links.filter(h => h.includes('Baloo+Da+2'))).toHaveLength(1)
  expect(links.every(h => h.startsWith('https://fonts.googleapis.com/css2?family=') && h.endsWith('&display=swap'))).toBe(true)
  expect(document.head.querySelector('link[rel=preconnect][href="https://fonts.gstatic.com"]')).not.toBeNull()
})

it('every font_family token of THEMING.md has a Google family, and Inter brings a Bangla fallback', () => {
  for (const k of ['hind-siliguri', 'noto-sans-bengali', 'baloo-da-2', 'anek-bangla', 'inter']) expect(GOOGLE_FAMILIES[k]).toBeTruthy()
  loadFont('inter')
  expect(document.head.querySelector('link[data-font="hind-siliguri"]')).not.toBeNull()
})
