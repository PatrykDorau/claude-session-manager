import { describe, expect, it } from 'vitest'
import { isBotUser, newCommentsPrompt, newHumanNotes, ownMrsToWatch, parseBots, parseMrKey, watchAction, watchStep } from '../src/main/mrwatch'

const note = (id: number, username: string, system = false) => ({ id, system, author: { username } })

const discussions = [
  { notes: [note(10, 'me')] },
  { notes: [note(11, 'gitlab', true)] },
  { notes: [note(12, 'dao-gitlab')] },
  { notes: [note(13, 'anna'), note(14, 'sonarqube')] }
]

describe('newHumanNotes', () => {
  it('returns every note that is not mine, system or a bot named in the list', () => {
    expect(newHumanNotes(discussions, null, 'me', ['dao-gitlab'])).toEqual({ ids: [13, 14], maxId: 14 })
  })

  it('returns only notes after lastSeenId', () => {
    expect(newHumanNotes(discussions, 13, 'me', ['dao-gitlab'])).toEqual({ ids: [14], maxId: 14 })
  })

  it('counts bot notes in maxId', () => {
    expect(newHumanNotes([{ notes: [note(20, 'dao-gitlab')] }], null, 'me', ['dao-gitlab'])).toEqual({ ids: [], maxId: 20 })
  })

  it('returns empty result for non-array input', () => {
    expect(newHumanNotes({}, null, 'me', [])).toEqual({ ids: [], maxId: null })
  })
})

describe('parseBots', () => {
  it('trims, lowercases and drops empty entries', () => {
    expect(parseBots(' dao-gitlab, Bot2 ,')).toEqual(['dao-gitlab', 'bot2'])
  })

  it('matches bots case-insensitively', () => {
    expect(newHumanNotes([{ notes: [note(1, 'Dao-GitLab')] }], null, 'me', ['dao-gitlab']).ids).toEqual([])
  })
})

describe('watchAction', () => {
  it('is none without new comments', () => {
    expect(watchAction(false, null)).toBe('none')
  })

  it('starts when there is no address session', () => {
    expect(watchAction(true, null)).toBe('start')
  })

  it('prompts a live idle session', () => {
    expect(watchAction(true, { status: 'idle', isLive: true })).toBe('prompt')
  })

  it('holds while the live session is working or waiting', () => {
    expect(watchAction(true, { status: 'working', isLive: true })).toBe('hold')
    expect(watchAction(true, { status: 'waiting', isLive: true })).toBe('hold')
  })

  it('starts when the session is not live', () => {
    expect(watchAction(true, { status: 'idle', isLive: false })).toBe('start')
  })
})

describe('watchStep', () => {
  it('records the newest note on the first fetch without acting', () => {
    expect(watchStep(null, { ids: [13, 14], maxId: 14 })).toEqual({ lastSeenId: 14, isNewComment: false })
  })

  it('records 0 on a first fetch of an MR without notes', () => {
    expect(watchStep(null, { ids: [], maxId: null })).toEqual({ lastSeenId: 0, isNewComment: false })
  })

  it('acts on every human note when created with lastSeenId 0', () => {
    expect(watchStep(0, { ids: [13], maxId: 14 })).toEqual({ lastSeenId: 14, isNewComment: true })
  })

  it('reports new notes after the first fetch and never moves lastSeenId back', () => {
    expect(watchStep(14, { ids: [], maxId: 14 })).toEqual({ lastSeenId: 14, isNewComment: false })
    expect(watchStep(14, { ids: [15], maxId: 15 })).toEqual({ lastSeenId: 15, isNewComment: true })
    expect(watchStep(20, { ids: [], maxId: null })).toEqual({ lastSeenId: 20, isNewComment: false })
  })
})

describe('parseMrKey', () => {
  it('splits project id and iid', () => {
    expect(parseMrKey('42!534')).toEqual({ projectId: 42, iid: 534 })
  })

  it('rejects other keys', () => {
    expect(parseMrKey('SOFKRS-1')).toBeNull()
  })
})

describe('ownMrsToWatch', () => {
  const mr = (key: string, author: string, ticket: string | null): { key: string; author: string; ticket: string | null } => ({ key, author, ticket })
  const jobs = [
    { kind: 'ticket', key: 'SOFKRS-1' },
    { kind: 'ticket', key: 'SOFKRS-2' },
    { kind: 'watch', key: '1!2' }
  ]

  it('returns own MRs of orchestrated tickets that are not watched yet', () => {
    const items = [mr('1!1', 'Me', 'sofkrs-1'), mr('1!2', 'Me', 'SOFKRS-2'), mr('1!3', 'Other', 'SOFKRS-1'), mr('1!4', 'Me', 'SOFKRS-9'), mr('1!5', 'Me', null)]
    expect(ownMrsToWatch(items, 'Me', jobs).map((m) => m.key)).toEqual(['1!1'])
  })

  it('returns nothing without a known user', () => {
    expect(ownMrsToWatch([mr('1!1', 'Me', 'SOFKRS-1')], null, jobs)).toEqual([])
  })
})

describe('newCommentsPrompt', () => {
  it('names the MR and skill and forbids commit, push and replies', () => {
    const prompt = newCommentsPrompt(534)
    expect(prompt).toContain('!534')
    expect(prompt).toContain('address-mr-comments')
    expect(prompt).toContain('Nie commituj')
    expect(prompt).toContain('nie pushuj')
    expect(prompt).toContain('nie odpowiadaj w GitLabie')
  })
})

describe('isBotUser', () => {
  it('treats listed usernames as bots, ignoring case', () => {
    expect(isBotUser('DAO-GitLab', ['dao-gitlab'])).toBe(true)
  })
  it('treats GitLab group and project token users as bots', () => {
    expect(isBotUser('group_1379_bot_9f9496523c939bf9970d778a2d0156ba', [])).toBe(true)
    expect(isBotUser('project_42_bot', [])).toBe(true)
  })
  it('keeps people', () => {
    expect(isBotUser('pawel.kolano', ['dao-gitlab'])).toBe(false)
    expect(isBotUser('robot.fan', [])).toBe(false)
    expect(isBotUser('', [])).toBe(false)
  })
})

describe('newHumanNotes with token bots', () => {
  it('skips notes from GitLab group token bots', () => {
    const json = [{ notes: [{ id: 7, body: 'Quality Gate passed', author: { username: 'group_1379_bot_abc' } }, { id: 8, body: 'hi', author: { username: 'anna' } }] }]
    expect(newHumanNotes(json, null, 'me', []).ids).toEqual([8])
  })
})
