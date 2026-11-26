const BOUNDARY_START = '(?<![\\p{L}\\p{N}_])'
const BOUNDARY_END = '(?![\\p{L}\\p{N}_])'
const bounded = (body: string): RegExp => new RegExp(`${BOUNDARY_START}(?:${body})${BOUNDARY_END}`, 'u')

const FORBIDDEN_COMMANDS = [
  bounded('git(?:\\.exe)?\\s+(?:commit|push)'),
  bounded('gitlab\\.js(?:\\s+\\S+)*?\\s+mr\\s+(?:create|update|draft-note)'),
  bounded('jira\\.js(?:\\s+\\S+)*?\\s+comment'),
  bounded('gh(?:\\.exe)?\\s+(?:pr|issue)\\s+(?:create|merge|close|comment)'),
  bounded('glab(?:\\.exe)?')
]

const GIT_TOKEN = /(?:^|[/\\])git(?:\.exe)?$/
const GIT_FORBIDDEN_VERBS = ['commit', 'push']

const FORBIDDEN_QUESTION = new RegExp(
  `commit|komit|merg|push|pusz|wypch|opublik|draft[- ]?note|merge request|${BOUNDARY_START}mr${BOUNDARY_END}`,
  'iu'
)

const DISPATCHER_FORBIDDEN = /koment|comment|jir|publish|publik/iu

const IGNORED_QUESTION_WORD = /^(?:uncommit|niezacommit)/iu

const FILE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

const FORBIDDEN_PATH = /[\\/]\.claude[\\/]settings|claude\.md$/i

const normalize = (command: string): string => command.replace(/\\\r?\n/g, ' ').toLowerCase().replace(/["']/g, '')

const isForbiddenGitSegment = (segment: string): boolean => {
  const tokens = segment.split(/[\s()`$<>{}]+/).filter(Boolean)
  const gitIndex = tokens.findIndex((token) => GIT_TOKEN.test(token))
  return gitIndex !== -1 && tokens.slice(gitIndex + 1).some((token) => GIT_FORBIDDEN_VERBS.includes(token))
}

const isForbiddenCommand = (command: string): boolean => {
  const normalized = normalize(command)
  return normalized.split(/[;&|\n]/).some(isForbiddenGitSegment) || FORBIDDEN_COMMANDS.some((pattern) => pattern.test(normalized))
}

const withoutIgnoredWords = (text: string): string =>
  text
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((word: string) => !IGNORED_QUESTION_WORD.test(word))
    .join(' ')

const questionText = (rawInput: any): string => {
  const questions = Array.isArray(rawInput?.questions) ? rawInput.questions : []
  return withoutIgnoredWords(
    questions
      .flatMap((q: any) => [q?.header, q?.question, ...(Array.isArray(q?.options) ? q.options.map((o: any) => o?.label) : [])])
      .filter((text: unknown): text is string => typeof text === 'string')
      .join('\n')
  )
}

const isForbiddenPath = (rawInput: any): boolean =>
  [rawInput?.file_path, rawInput?.notebook_path].some((path) => typeof path === 'string' && FORBIDDEN_PATH.test(path.trim()))

export const isForbiddenPrompt = (text: string): boolean =>
  isForbiddenCommand(text) || FORBIDDEN_QUESTION.test(withoutIgnoredWords(text)) || DISPATCHER_FORBIDDEN.test(text)

export const isForbiddenDispatcherQuestion = (rawInput: unknown): boolean => DISPATCHER_FORBIDDEN.test(questionText(rawInput))

export const isForbiddenRequest = (toolName: string, rawInput: unknown): boolean => {
  if (FILE_TOOLS.includes(toolName)) return isForbiddenPath(rawInput)
  if (toolName === 'Bash') {
    const command = (rawInput as any)?.command
    return typeof command === 'string' && isForbiddenCommand(command)
  }
  if (toolName === 'AskUserQuestion') return FORBIDDEN_QUESTION.test(questionText(rawInput))
  return false
}
