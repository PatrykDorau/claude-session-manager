import type { Status } from '../renderer/src/types'

export const parseBots = (csv: string): string[] =>
  csv
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '')

const TOKEN_BOT = /^(group|project)_\d+_bot(_|$)/i

export const isBotUser = (username: string, bots: string[]): boolean =>
  bots.includes(username.toLowerCase()) || TOKEN_BOT.test(username)

export const newHumanNotes = (
  discussionsJson: unknown,
  lastSeenId: number | null,
  me: string,
  bots: string[]
): { ids: number[]; maxId: number | null } => {
  if (!Array.isArray(discussionsJson)) return { ids: [], maxId: null }
  const notes = discussionsJson.flatMap((d: any) => (Array.isArray(d?.notes) ? d.notes : []))
  const numbered = notes.filter((n: any) => typeof n?.id === 'number')
  const ids = numbered
    .filter((n: any) => {
      const username = String(n.author?.username ?? '').toLowerCase()
      return (
        n.system !== true &&
        username !== me.toLowerCase() &&
        !isBotUser(username, bots) &&
        (lastSeenId === null || n.id > lastSeenId)
      )
    })
    .map((n: any) => n.id as number)
  const maxId = numbered.length === 0 ? null : Math.max(...numbered.map((n: any) => n.id as number))
  return { ids, maxId }
}

export const watchAction = (
  isNewComment: boolean,
  addressSession: { status: Status; isLive: boolean } | null
): 'none' | 'prompt' | 'hold' | 'start' => {
  if (!isNewComment) return 'none'
  if (addressSession === null || !addressSession.isLive) return 'start'
  return addressSession.status === 'working' || addressSession.status === 'waiting' ? 'hold' : 'prompt'
}

export const watchStep = (
  lastSeenId: number | null,
  notes: { ids: number[]; maxId: number | null }
): { lastSeenId: number; isNewComment: boolean } => {
  if (lastSeenId === null) return { lastSeenId: notes.maxId ?? 0, isNewComment: false }
  return { lastSeenId: Math.max(lastSeenId, notes.maxId ?? lastSeenId), isNewComment: notes.ids.length > 0 }
}

export const parseMrKey = (key: string): { projectId: number; iid: number } | null => {
  const match = /^(\d+)!(\d+)$/.exec(key)
  return match ? { projectId: Number(match[1]), iid: Number(match[2]) } : null
}

export const ownMrsToWatch = <T extends { key: string; author: string; ticket: string | null }>(
  items: T[],
  me: string | null,
  jobs: { kind: string; key: string }[]
): T[] => {
  const tickets = new Set(jobs.filter((j) => j.kind === 'ticket').map((j) => j.key.toUpperCase()))
  const watched = new Set(jobs.filter((j) => j.kind === 'watch').map((j) => j.key))
  return items.filter((m) => !!me && m.author === me && !!m.ticket && tickets.has(m.ticket.toUpperCase()) && !watched.has(m.key))
}

export const newCommentsPrompt = (iid: number): string =>
  [
    `Pojawiły się nowe komentarze w MR !${iid}.`,
    'Użyj skilla address-mr-comments i odnieś się do nowych uwag.',
    'Nie commituj, nie pushuj i nie odpowiadaj w GitLabie — zostaw zmiany w working tree do mojego przeglądu.'
  ].join('\n')
