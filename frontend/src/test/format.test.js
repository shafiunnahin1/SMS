import { fmtMoney, fmtNumber } from '../i18n/format'

// docs/I18N.md section 3.4: Latin digits in every language (receipts and IDs stay unambiguous)
it('formats money and numbers with Latin digits in Bengali and English', () => {
  expect(fmtMoney(1700, 'bn')).toMatch(/^৳1,700$/)
  expect(fmtMoney('1200.50', 'en')).toBe('৳1,200.5')
  expect(fmtNumber(100000, 'bn')).not.toMatch(/[০-৯]/)
})
