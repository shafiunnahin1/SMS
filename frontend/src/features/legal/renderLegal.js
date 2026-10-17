// Step 8.1 (privacy-and-consent.md section 8): the owner's legal text is a small markdown file (public/legal/*.md) that a
// non-developer can replace. Only what such a text needs is read: "# " / "## " headings, "- " list items, paragraphs, `code`.
// Placeholders {{institution_name}}, {{platform_name}}, {{contact}}, {{platform_contact}} are filled in; a first line
// "<!-- draft -->" marks text not yet reviewed by a lawyer (D27). Returns plain blocks - React renders them, no HTML injection.
export function parseLegal(text, values = {}) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n')
  const draft = lines[0]?.trim() === '<!-- draft -->'
  const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => values[k] ?? m).replace(/`([^`]*)`/g, '$1')
  const blocks = []
  let para = []
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: fill(para.join(' ')) }); para = [] } }
  for (const raw of lines.slice(draft ? 1 : 0)) {
    const line = raw.trim()
    if (!line || line.startsWith('<!--')) { flush(); continue }
    const h = /^(#{1,2})\s+(.*)$/.exec(line)
    if (h) { flush(); blocks.push({ type: h[1].length === 1 ? 'h1' : 'h2', text: fill(h[2]) }); continue }
    if (line.startsWith('- ')) {
      flush()
      const last = blocks.at(-1)
      if (last?.type === 'ul') last.items.push(fill(line.slice(2))); else blocks.push({ type: 'ul', items: [fill(line.slice(2))] })
      continue
    }
    para.push(line)
  }
  flush()
  return { draft, blocks }
}
