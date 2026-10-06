// docs/THEMING.md: lazy-loads the selected Bengali font. The font packages are not in the frozen dependency list (G7) and Google-hosted
// fonts are ruled out (docs/I18N.md section 4.4: privacy, CSP), so the spike relies on the font stack in tokens.css falling back to a
// locally installed Bengali font. DECISIONS 2026-10-06 S (S5): the owner chooses how fonts ship (self-hosted files or @fontsource).
const loaded = new Set()

export function loadFont(key) {
  if (!key || loaded.has(key)) return
  loaded.add(key)
}
