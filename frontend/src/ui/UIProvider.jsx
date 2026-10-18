import { createContext, useContext } from 'react'
import { useInstitutionStore } from '../store/institutionStore'
import { PACKS } from './packs'

// docs/UI-PACKS.md section 4 "Runtime": the pack comes from the effective theme; unknown => classic (never a blank page)
const UICtx = createContext(PACKS.classic)

export function UIProvider({ children, pack }) {
  const packKey = useInstitutionStore(s => s.theme?.ui_pack) ?? 'classic'
  const value = pack ?? PACKS[packKey] ?? PACKS.classic
  return <UICtx.Provider value={value}>{children}</UICtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useUI = () => useContext(UICtx)
