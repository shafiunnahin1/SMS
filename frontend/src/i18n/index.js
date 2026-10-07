import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import bn from './bn.json'
import en from './en.json'
import ar from './ar.json'

// docs/I18N.md section 3.1: fallback ar -> bn -> en, bn -> en, en -> bn; React escapes, so i18next must not.
// Menu labels are the Bengali text of AUTHORIZATION.md's menu data; they are looked up flat (keySeparator off for them via `nav:` namespace).
i18n.use(initReactI18next).init({
  resources: { bn: { translation: bn.app, nav: bn.nav }, en: { translation: en.app, nav: en.nav }, ar: { translation: ar.app, nav: ar.nav } },
  lng: 'bn',
  fallbackLng: { ar: ['bn', 'en'], bn: ['en'], en: ['bn'], default: ['bn'] },
  interpolation: { escapeValue: false },
  returnNull: false,
})

// The Bengali menu text IS the key, so a missing translation must fall back to it (ar -> bn), not on to English
// `lng` lets a render use the language it is switching TO (i18next changes after the render, in an effect)
export const navLabel = (label, lng = i18n.language) => i18n.getResource(lng, 'nav', label) ?? label

export default i18n
