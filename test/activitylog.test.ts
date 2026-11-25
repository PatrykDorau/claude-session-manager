import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import {
  ACTIVITY_THROTTLE_MS,
  ACTIVITY_KEEP_DAYS,
  IDLE_DROP_MS,
  isIdleMark,
  activityFile,
  parseActivity,
  createActivityLog,
  staleActivityFiles
} from '../src/main/activitylog'
import { dayOf } from '../src/main/timesheet'

const DIR = join('base', 'dir')

interface SetupResult {
  clock: { now: number }
  writes: { file: string; line: string }[]
  log: ReturnType<typeof createActivityLog>
}

const fileOf = (write: { file: string }): string => write.file

const setup = (start: number): SetupResult => {
  const clock = { now: start }
  const writes: { file: string; line: string }[] = []
  const recordWrite = (file: string, line: string): void => {
    writes.push({ file, line })
  }
  const log = createActivityLog(DIR, () => clock.now, recordWrite)
  return { clock, writes, log }
}

describe('constants', () => {
  it('has the agreed values', () => {
    expect(ACTIVITY_THROTTLE_MS).toBe(30_000)
    expect(ACTIVITY_KEEP_DAYS).toBe(90)
    expect(IDLE_DROP_MS).toBe(5 * 60_000)
  })
})

describe('isIdleMark', () => {
  it('keeps marks while the system has fresh input', () => {
    expect(isIdleMark(0)).toBe(false)
    expect(isIdleMark(299)).toBe(false)
  })

  it('drops marks after 5 minutes without input', () => {
    expect(isIdleMark(300)).toBe(true)
    expect(isIdleMark(3600)).toBe(true)
  })
})

describe('activityFile', () => {
  it('joins dir, activity and the day', () => {
    expect(activityFile(DIR, '2026-11-24')).toBe(join(DIR, 'activity', '2026-11-24.jsonl'))
  })
})

describe('parseActivity', () => {
  it('parses lines as cockpit events', () => {
    const text = '{"at":1000,"ticket":"AB-1"}\n{"at":2000,"ticket":null}\n'
    expect(parseActivity(text)).toEqual([
      { at: 1000, ticket: 'AB-1', source: 'cockpit' },
      { at: 2000, ticket: null, source: 'cockpit' }
    ])
  })

  it('skips blank lines and a truncated last line', () => {
    const text = '{"at":1000,"ticket":"AB-1"}\n\n   \n{"at":2000,"tick'
    expect(parseActivity(text)).toEqual([{ at: 1000, ticket: 'AB-1', source: 'cockpit' }])
  })
})

describe('createActivityLog', () => {
  it('writes the first mark', () => {
    const { writes, log } = setup(new Date(2026, 10, 24, 10, 0, 0).getTime())
    log.mark('AB-1')
    expect(writes).toHaveLength(1)
    expect(writes[0].file).toBe(activityFile(DIR, '2026-11-24'))
    expect(JSON.parse(writes[0].line)).toEqual({
      at: new Date(2026, 10, 24, 10, 0, 0).getTime(),
      ticket: 'AB-1'
    })
    expect(writes[0].line.endsWith('\n')).toBe(true)
  })

  it('drops a second mark for the same ticket within 30 s', () => {
    const { clock, writes, log } = setup(new Date(2026, 10, 24, 10, 0, 0).getTime())
    log.mark('AB-1')
    clock.now += 29_000
    log.mark('AB-1')
    expect(writes).toHaveLength(1)
  })

  it('writes A, B, A within 30 s as three lines', () => {
    const { clock, writes, log } = setup(new Date(2026, 10, 24, 10, 0, 0).getTime())
    log.mark('AB-1')
    clock.now += 1000
    log.mark('AB-2')
    clock.now += 1000
    log.mark('AB-1')
    expect(writes).toHaveLength(3)
  })

  it('writes A, A within 30 s as one line', () => {
    const { clock, writes, log } = setup(new Date(2026, 10, 24, 10, 0, 0).getTime())
    log.mark('AB-1')
    clock.now += 1000
    log.mark('AB-1')
    expect(writes).toHaveLength(1)
  })

  it('writes a mark for another ticket and for the null ticket', () => {
    const { clock, writes, log } = setup(new Date(2026, 10, 24, 10, 0, 0).getTime())
    log.mark('AB-1')
    clock.now += 1000
    log.mark('AB-2')
    log.mark(null)
    expect(writes).toHaveLength(3)
  })

  it('writes again after 30 s', () => {
    const { clock, writes, log } = setup(new Date(2026, 10, 24, 10, 0, 0).getTime())
    log.mark('AB-1')
    clock.now += 30_000
    log.mark('AB-1')
    expect(writes).toHaveLength(2)
  })

  it('does not throw when append throws', () => {
    const failAppend = (): void => {
      throw new Error('EPERM')
    }
    const log = createActivityLog(DIR, () => 1000, failAppend)
    const runMark = (): void => log.mark('AB-1')
    expect(runMark).not.toThrow()
  })

  it('writes marks around midnight to two day files', () => {
    const { clock, writes, log } = setup(new Date(2026, 10, 24, 23, 59, 50).getTime())
    log.mark('AB-1')
    clock.now = new Date(2026, 10, 25, 0, 0, 10).getTime()
    log.mark('AB-2')
    expect(writes.map(fileOf)).toEqual([
      activityFile(DIR, '2026-11-24'),
      activityFile(DIR, '2026-11-25')
    ])
  })
})

describe('staleActivityFiles', () => {
  it('returns only matching names older than the keep window', () => {
    const names = [
      '2026-11-24.jsonl',
      '2026-08-26.jsonl',
      '2026-08-25.jsonl',
      '2025-01-01.jsonl',
      'notes.txt',
      '2025-01-01.json'
    ]
    expect(staleActivityFiles(names, '2026-11-24', 90)).toEqual([
      '2026-08-25.jsonl',
      '2025-01-01.jsonl'
    ])
  })
})

describe('dayOf', () => {
  it('formats the local date', () => {
    expect(dayOf(new Date(2026, 0, 5, 23, 59, 59).getTime())).toBe('2026-01-05')
    expect(dayOf(new Date(2026, 0, 6, 0, 0, 0).getTime())).toBe('2026-01-06')
  })
})
