import { useInstitutionStore } from '../store/institutionStore'

// docs/templates/react-core-files.md: modules come only from /bootstrap (ModuleGate on the server); plan features are not a module check
export function useModules() {
  const has = useInstitutionStore(s => s.hasModule)
  const modules = useInstitutionStore(s => s.modules)
  return { has, modules }
}
