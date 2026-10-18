import { useCallback } from 'react'
import { useInstitutionStore } from '../store/institutionStore'
import { useLocale } from '../ui/I18nProvider'

// D5 + docs/I18N.md section 3.1: terms[key][locale] ?? bn ?? en ?? key. Pages never hard-code Class/Section/Batch/Course.
export function useTerms() {
  const terms = useInstitutionStore(s => s.terms)
  const { locale } = useLocale()
  return useCallback((key) => terms?.[key]?.[locale] ?? terms?.[key]?.bn ?? terms?.[key]?.en ?? key, [terms, locale])
}
