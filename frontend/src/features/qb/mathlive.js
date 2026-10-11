// D66 (QB.3): mathlive loads only on the screens that show or write maths - one shared import for the whole app
let pending = null
export const loadMathlive = () => (pending ??= Promise.all([import('mathlive'), import('mathlive/fonts.css'), import('mathlive/static.css')]).then(([m]) => m))

// LaTeX commands that can carry links or raw HTML/CSS are shown as plain text, never rendered
export const UNSAFE_LATEX = /\\(?:href|url|htmlData|htmlId|htmlStyle|class|cssId|style|data|includegraphics)\b/
