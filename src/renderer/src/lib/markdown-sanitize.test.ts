// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { sanitizeSvg } from './markdown'

describe('sanitizeSvg (mermaid output hardening)', () => {
  it('keeps benign SVG content', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    )
    expect(out).toContain('<rect')
    expect(out).toContain('width="10"')
  })

  it('strips <script> elements', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>'
    )
    expect(out.toLowerCase()).not.toContain('<script')
    expect(out).toContain('<rect')
  })

  it('strips inline event handlers', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" onclick="evil()"/></svg>'
    )
    expect(out.toLowerCase()).not.toContain('onload')
    expect(out.toLowerCase()).not.toContain('onclick')
  })

  it('strips javascript: hrefs', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>'
    )
    expect(out.toLowerCase()).not.toContain('javascript:')
  })

  it('returns empty string for unparseable input', () => {
    expect(sanitizeSvg('<svg><rect>')).toBe('')
  })
})
