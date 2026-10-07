// docs/I18N.md section 3.4: Latin digits in every language; Asia/Dhaka dates
const TAG = { bn: 'bn-BD-u-nu-latn', en: 'en-BD', ar: 'ar-u-nu-latn' }
const tag = (l) => TAG[l] ?? TAG.bn

export const fmtNumber = (n, l) => new Intl.NumberFormat(tag(l)).format(n)
export const fmtMoney = (n, l) => '৳' + new Intl.NumberFormat(tag(l), { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n))
export const fmtDate = (d, l) => new Intl.DateTimeFormat(tag(l), { dateStyle: 'medium', timeZone: 'Asia/Dhaka' }).format(new Date(d))
export const fmtTime = (d, l) => new Intl.DateTimeFormat(tag(l), { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' }).format(new Date(d))
