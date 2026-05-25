// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { newCard, scheduleCard, rangeForOffsets } from './annotations'

describe('flashcard scheduling (SM-2)', () => {
  it('newCard is due immediately with default ease', () => {
    const c = newCard('What is 2+2?')
    expect(c.question).toBe('What is 2+2?')
    expect(c.ease).toBeCloseTo(2.5)
    expect(c.reps).toBe(0)
    expect(c.intervalDays).toBe(0)
    expect(c.due).toBeLessThanOrEqual(Date.now())
  })

  it('"good" answers grow the interval and reps', () => {
    let c = newCard('q')
    c = scheduleCard(c, 2)
    expect(c.reps).toBe(1)
    expect(c.intervalDays).toBe(1)
    c = scheduleCard(c, 2)
    expect(c.reps).toBe(2)
    expect(c.intervalDays).toBe(3)
    const before = c.intervalDays
    c = scheduleCard(c, 2)
    expect(c.intervalDays).toBeGreaterThan(before)
  })

  it('"again" resets reps and lowers ease', () => {
    let c = newCard('q')
    c = scheduleCard(c, 3)
    c = scheduleCard(c, 3)
    const easeAfterEasy = c.ease
    c = scheduleCard(c, 0)
    expect(c.reps).toBe(0)
    expect(c.intervalDays).toBe(0)
    expect(c.ease).toBeLessThan(easeAfterEasy)
    expect(c.ease).toBeGreaterThanOrEqual(1.3)
  })

  it('ease never drops below 1.3', () => {
    let c = newCard('q')
    for (let i = 0; i < 20; i++) c = scheduleCard(c, 0)
    expect(c.ease).toBeGreaterThanOrEqual(1.3)
  })
})

describe('rangeForOffsets', () => {
  it('maps character offsets back to a DOM range across nodes', () => {
    const root = document.createElement('div')
    root.innerHTML = 'Hello <b>brave</b> world'
    const range = rangeForOffsets(root, 6, 11)
    expect(range).not.toBeNull()
    expect(range!.toString()).toBe('brave')
  })

  it('returns null for out-of-range offsets', () => {
    const root = document.createElement('div')
    root.textContent = 'short'
    expect(rangeForOffsets(root, 100, 200)).toBeNull()
  })
})
