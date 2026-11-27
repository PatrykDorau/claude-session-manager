import { describe, it, expect } from 'vitest'
import { isForbiddenRequest } from '../src/main/guard'

const padded = `${'echo hi && '.repeat(40)}npm test && git push --force-with-lease`

describe('isForbiddenRequest', () => {
  it.each([
    'git commit -m x',
    'git push origin HEAD',
    'npm test && git push --force-with-lease',
    padded,
    'node C:/Users/ASSET-17300/.claude/tools/gitlab.js mr create --title x',
    'node C:/Users/ASSET-17300/.claude/tools/gitlab.js mr update 5 --title y',
    'node C:/Users/ASSET-17300/.claude/tools/gitlab.js mr draft-note 5 --body z',
    'node C:/Users/ASSET-17300/.claude/tools/jira.js comment SOFKRS-1 --body-file a.md',
    'git push origin --delete feat/x',
    'gh pr create',
    'git -C ../x push',
    'git -c user.name=a commit -m x',
    'git --no-pager push',
    'git.exe push',
    '"C:/Program Files/Git/cmd/git.exe" push',
    '"git" push',
    'GIT push',
    'node "C:/Users/me/.claude/tools/gitlab.js" mr create --title x',
    "node 'C:/x/jira.js' comment K-1 --body-file a.md",
    '(git push)',
    '(cd ../x && git push)',
    '`git push`',
    'echo $(git push)',
    'git \\\npush',
    'git push>out.txt'
  ])('forbids Bash command %s', (command) => {
    expect(isForbiddenRequest('Bash', { command })).toBe(true)
  })

  it.each([
    'git diff origin/develop',
    'node C:/Users/ASSET-17300/.claude/tools/gitlab.js mr view 5',
    'npx vitest run',
    'node "C:/Users/me/.claude/tools/gitlab.js" mr view 5',
    'git -C ../x diff origin/develop'
  ])('allows Bash command %s', (command) => {
    expect(isForbiddenRequest('Bash', { command })).toBe(false)
  })

  it('allows other tools', () => {
    expect(isForbiddenRequest('Read', { file_path: 'a.ts' })).toBe(false)
  })

  it('forbids questions that mention commit or push', () => {
    const ask = (question: string): unknown => ({ questions: [{ question, options: [{ label: 'Tak' }, { label: 'Nie' }] }] })
    expect(isForbiddenRequest('AskUserQuestion', ask('Czy zrobić commit i push?'))).toBe(true)
    expect(isForbiddenRequest('AskUserQuestion', ask('Czy wypchnąć zmiany?'))).toBe(true)
    expect(isForbiddenRequest('AskUserQuestion', ask('Czy plan jest dobry?'))).toBe(false)
    for (const question of ['Czy zrobić commita?', 'Czy mam zacommitować i spushować?', 'Czy pushnąć zmiany?', 'Czy wystawić MR?', 'Czy zrobić komit?', 'Czy zmergować?']) {
      expect(isForbiddenRequest('AskUserQuestion', ask(question))).toBe(true)
    }
  })

  it('leaves Jira comment and publish wording to the dispatcher guard', () => {
    const ask = (question: string): unknown => ({ questions: [{ question, options: [{ label: 'Tak' }, { label: 'Nie' }] }] })
    expect(isForbiddenRequest('AskUserQuestion', ask('Dodać komentarz w Jirze?'))).toBe(false)
    expect(isForbiddenRequest('AskUserQuestion', ask('Publish the review?'))).toBe(false)
  })

  it('scans the question header', () => {
    const input = { questions: [{ header: 'Push', question: 'Co dalej?', options: [{ label: 'Tak' }] }] }
    expect(isForbiddenRequest('AskUserQuestion', input)).toBe(true)
  })

  it('ignores uncommitted mentions and option descriptions', () => {
    const ask = (question: string): unknown => ({ questions: [{ question, options: [{ label: 'Tak' }, { label: 'Nie' }] }] })
    expect(isForbiddenRequest('AskUserQuestion', ask('Plan zapisany, niezacommitowany. Akceptujesz?'))).toBe(false)
    expect(isForbiddenRequest('AskUserQuestion', ask('The plan is written and uncommitted. Approve?'))).toBe(false)
    expect(isForbiddenRequest('AskUserQuestion', ask('Czy zrobić commit?'))).toBe(true)
    expect(isForbiddenRequest('AskUserQuestion', ask('Czy wypchnąć?'))).toBe(true)
    const described = { questions: [{ question: 'Jak wykonać plan?', options: [{ label: 'Inline', description: 'Bez push i bez MR' }] }] }
    expect(isForbiddenRequest('AskUserQuestion', described)).toBe(false)
    const labelled = { questions: [{ question: 'Co dalej?', options: [{ label: 'Push', description: 'x' }] }] }
    expect(isForbiddenRequest('AskUserQuestion', labelled)).toBe(true)
  })

  it.each([
    ['Edit', { file_path: 'C:\\repo\\.claude\\settings.local.json' }],
    ['Write', { file_path: 'C:/Users/me/.claude/settings.json' }],
    ['MultiEdit', { file_path: '/repo/CLAUDE.md' }],
    ['Edit', { file_path: 'C:\\Users\\me\\.claude\\claude.md' }],
    ['NotebookEdit', { notebook_path: '/repo/.claude/settings.json' }]
  ])('forbids %s on agent settings %o', (toolName, rawInput) => {
    expect(isForbiddenRequest(toolName, rawInput)).toBe(true)
  })

  it('allows file tools on other paths', () => {
    expect(isForbiddenRequest('Edit', { file_path: 'C:/repo/src/settings.ts' })).toBe(false)
    expect(isForbiddenRequest('Write', { file_path: 'C:/repo/.claude/handoff.md' })).toBe(false)
  })
})
