import { describe, it, expect } from 'vitest'
import { parseChart } from './chart'

describe('parseChart', () => {
  it('parses the key:value spec', () => {
    const r = parseChart('type: line\ntitle: Growth\nx: [2000, 2005, 2010]\ny: [2.1, 2.8, 3.4]')
    expect('spec' in r).toBe(true)
    if ('spec' in r) {
      expect(r.spec.type).toBe('line')
      expect(r.spec.title).toBe('Growth')
      expect(r.spec.x).toEqual([2000, 2005, 2010])
      expect(r.spec.series[0].data).toEqual([2.1, 2.8, 3.4])
    }
  })

  it('parses multiple series (y, y2) with legend names', () => {
    const r = parseChart('type: bar\nseries: [Sales, Costs]\ny: [10, 20]\ny2: [5, 8]')
    expect('spec' in r && r.spec.series.length).toBe(2)
    if ('spec' in r) {
      expect(r.spec.series[0].name).toBe('Sales')
      expect(r.spec.series[1].data).toEqual([5, 8])
    }
  })

  it('parses pie via labels + values', () => {
    const r = parseChart('type: pie\nlabels: [A, B, C]\nvalues: [40, 35, 25]')
    if ('spec' in r) {
      expect(r.spec.type).toBe('pie')
      expect(r.spec.series[0].data).toEqual([40, 35, 25])
      expect(r.spec.x).toEqual(['A', 'B', 'C'])
    } else throw new Error('expected spec')
  })

  it('parses a JSON spec', () => {
    const r = parseChart('{"type":"scatter","x":[1,2,3],"y":[4,5,6]}')
    expect('spec' in r && r.spec.type).toBe('scatter')
  })

  it('defaults an unknown type to bar', () => {
    const r = parseChart('type: hologram\ny: [1,2,3]')
    expect('spec' in r && r.spec.type).toBe('bar')
  })

  it('errors with no numeric data', () => {
    expect('error' in parseChart('type: line\ntitle: Empty')).toBe(true)
  })

  it('errors on invalid JSON', () => {
    expect('error' in parseChart('{ bad json')).toBe(true)
  })

  it('coerces non-numeric data entries to 0 rather than NaN', () => {
    const r = parseChart('type: bar\ny: [1, x, 3]')
    if ('spec' in r) expect(r.spec.series[0].data).toEqual([1, 0, 3])
    else throw new Error('expected spec')
  })

  it('coerces non-finite values (e.g. 1e999 → Infinity) to 0', () => {
    const r = parseChart('type: line\ny: [1, 1e999, 3]')
    if ('spec' in r) expect(r.spec.series[0].data).toEqual([1, 0, 3])
    else throw new Error('expected spec')
  })

  it('rejects a pie with all-zero values', () => {
    expect('error' in parseChart('type: pie\nlabels: [A, B]\nvalues: [0, 0]')).toBe(true)
  })

  it('rejects a pie with all-negative values', () => {
    expect('error' in parseChart('type: pie\nvalues: [-1, -2]')).toBe(true)
  })

  it('caps very large data arrays to a sane maximum length', () => {
    const big = 'type: line\nx: [' + Array.from({ length: 5000 }, (_, i) => i).join(',') + ']\n' +
      'y: [' + Array.from({ length: 5000 }, (_, i) => i).join(',') + ']'
    const r = parseChart(big)
    if ('spec' in r) {
      expect(r.spec.series[0].data.length).toBeLessThanOrEqual(2000)
      expect(r.spec.x.length).toBeLessThanOrEqual(2000)
    } else throw new Error('expected spec')
  })
})
