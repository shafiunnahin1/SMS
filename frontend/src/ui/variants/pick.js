import { useUI } from '../UIProvider'

// Phase A (docs/UI-PACKS.md section 10) ships the DEFAULT variant of each component slot; a pack naming a variant that is not
// built yet gets the default, so a manifest is never a blank component. Phase B (Step 5.4) adds the rest to each map.
export function usePick(slot, map, fallback) {
  const { components = {} } = useUI() ?? {}
  return map[components[slot]] ?? map[fallback]
}
