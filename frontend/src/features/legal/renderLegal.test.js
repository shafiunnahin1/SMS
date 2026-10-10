import { describe, expect, it } from 'vitest'
import { parseLegal } from './renderLegal'

describe('parseLegal (Step 8.1 legal pages)', () => {
  it('reads headings, lists and paragraphs and fills the placeholders', () => {
    const { draft, blocks } = parseLegal('<!-- draft -->\n# Title\n\nWe are `{{institution_name}}`,\nrun by {{platform_name}}.\n\n## Keep\n- one\n- two\n', { institution_name: 'Alo School', platform_name: 'EduSaaS' })
    expect(draft).toBe(true)
    expect(blocks).toEqual([
      { type: 'h1', text: 'Title' },
      { type: 'p', text: 'We are Alo School, run by EduSaaS.' },
      { type: 'h2', text: 'Keep' },
      { type: 'ul', items: ['one', 'two'] },
    ])
  })
  it('the lawyer text without the draft line is not a draft; unknown placeholders and HTML stay plain text', () => {
    const { draft, blocks } = parseLegal('# Final\n<b>{{unknown}}</b>')
    expect(draft).toBe(false)
    expect(blocks[1]).toEqual({ type: 'p', text: '<b>{{unknown}}</b>' })
  })
})
