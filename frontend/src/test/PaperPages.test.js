import { describe, expect, it } from 'vitest'
import { paginateBlocks } from '../features/qb/paperOptions'

// D179 (5) QBO.1: real pages - columns fill before the next page, page 1 is shorter (header), questions never split, a section title
// stays with its first question, a page break starts a new page.
const b = (key, height, extra = {}) => ({ key, height, ...extra })

describe('paginateBlocks', () => {
  it('fills column 1, then column 2, then the next page', () => {
    const blocks = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => b(k, 40))
    expect(paginateBlocks(blocks, { columns: 2, firstHeight: 80, height: 120 })).toEqual([[['a', 'b'], ['c', 'd']], [['e', 'f'], []]])
  })

  it('never splits a block and gives a too-tall block its own column', () => {
    expect(paginateBlocks([b('a', 30), b('huge', 500), b('c', 30)], { columns: 1, firstHeight: 100, height: 100 })).toEqual([[['a']], [['huge']], [['c']]])
  })

  it('keeps a section title with the block after it', () => {
    const pages = paginateBlocks([b('q1', 70), b('title', 10, { keepWithNext: true }), b('q2', 40)], { columns: 1, firstHeight: 100, height: 100 })
    expect(pages).toEqual([[['q1']], [['title', 'q2']]])
  })

  it('starts a new page at a page break and uses one column when asked', () => {
    const pages = paginateBlocks([b('a', 10), b('s2', 10, { breakBefore: true }), b('c', 10)], { columns: 1, firstHeight: 100, height: 100 })
    expect(pages).toEqual([[['a']], [['s2', 'c']]])
    expect(paginateBlocks([], { columns: 2, firstHeight: 10, height: 10 })).toEqual([[[], []]])
  })
})
