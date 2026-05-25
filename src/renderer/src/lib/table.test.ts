import { describe, it, expect } from 'vitest'
import { parseDelimited, csvToMarkdownTable, markdownTableToCsv, extractTableBlock } from './table'

describe('csv ↔ markdown table', () => {
  it('converts simple CSV to a Markdown table with a header + separator', () => {
    const md = csvToMarkdownTable('a,b,c\n1,2,3')
    expect(md).toBe('| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |')
  })

  it('handles quoted fields containing commas', () => {
    const rows = parseDelimited('name,note\n"Smith, J.",hi')
    expect(rows).toEqual([
      ['name', 'note'],
      ['Smith, J.', 'hi']
    ])
  })

  it('handles escaped double-quotes inside quoted fields', () => {
    const rows = parseDelimited('q\n"she said ""hi"""')
    expect(rows[1][0]).toBe('she said "hi"')
  })

  it('auto-detects tab-delimited input (TSV from spreadsheets)', () => {
    const md = csvToMarkdownTable('a\tb\n1\t2')
    expect(md).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })

  it('escapes pipe characters in cells', () => {
    const md = csvToMarkdownTable('x\na|b')
    expect(md).toContain('a\\|b')
  })

  it('pads short rows so every row has the header column count', () => {
    const md = csvToMarkdownTable('a,b,c\n1,2')
    expect(md).toBe('| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |  |')
  })

  it('converts a Markdown table back to CSV, skipping the separator row', () => {
    const csv = markdownTableToCsv('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(csv).toBe('a,b\n1,2')
  })

  it('quotes CSV cells that contain commas or quotes on export', () => {
    const csv = markdownTableToCsv('| name | note |\n| --- | --- |\n| Smith, J. | say "hi" |')
    expect(csv).toBe('name,note\n"Smith, J.","say ""hi"""')
  })

  it('unescapes \\| back to | when exporting to CSV', () => {
    const csv = markdownTableToCsv('| x |\n| --- |\n| a\\|b |')
    expect(csv).toBe('x\na|b')
  })

  it('round-trips CSV → markdown → CSV for plain data', () => {
    const csv = 'h1,h2\nv1,v2\nv3,v4'
    expect(markdownTableToCsv(csvToMarkdownTable(csv))).toBe(csv)
  })

  it('returns empty string for blank input', () => {
    expect(csvToMarkdownTable('')).toBe('')
    expect(csvToMarkdownTable('   \n  ')).toBe('')
    expect(markdownTableToCsv('not a table')).toBe('')
  })

  it('extracts the table block surrounding a caret', () => {
    const text = 'intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\noutro'
    const caret = text.indexOf('1')
    expect(extractTableBlock(text, caret)).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })

  it('returns null when the caret is not inside a table', () => {
    const text = 'just a paragraph\nwith no table'
    expect(extractTableBlock(text, 3)).toBeNull()
  })

  it('does not delete a legitimate dash-only data row on export', () => {
    // Only row 2 (the GFM separator) should be dropped, not a body cell that happens to be "-".
    const csv = markdownTableToCsv('| a |\n| --- |\n| - |')
    expect(csv).toBe('a\n-')
  })

  it('keeps all rows when the block has no separator row (e.g. a selection of body rows)', () => {
    const csv = markdownTableToCsv('| 1 | 2 |\n| 3 | 4 |')
    expect(csv).toBe('1,2\n3,4')
  })

  it('returns null when the caret is past the end of the text', () => {
    const text = '| a |\n| --- |\n| 1 |'
    expect(extractTableBlock(text, text.length + 5)).toBeNull()
  })

  it('finds the table when the caret sits at the very end of a doc that ends in a table', () => {
    const text = 'x\n\n| a |\n| --- |\n| 1 |'
    expect(extractTableBlock(text, text.length)).toBe('| a |\n| --- |\n| 1 |')
  })

  it('treats an unterminated quote leniently (rest becomes one field)', () => {
    const rows = parseDelimited('a,"b\nc,d')
    expect(rows).toEqual([['a', 'b\nc,d']])
  })
})
