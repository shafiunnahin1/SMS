import classic from './packs/classic/manifest'
import mobile from './packs/mobile/manifest'

// docs/UI-PACKS.md section 4: the pack registry. `fresh` arrives in phase B (Step 5.4); an unknown key is classic.
export const PACKS = { classic, mobile }
