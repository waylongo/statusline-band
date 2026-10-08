import type { EngineInterface, Register } from 'claude-code'

// Solarized's accents, which read on a light and on a dark background
const BLUE = '#268bd2'
const CYAN = '#2aa198'
const GREEN = '#859900'
const YELLOW = '#b58900'
const ORANGE = '#cb4b16'
const RED = '#dc322f'

type Git = { branch: string; adds: number; dels: number }

// Read again at session.start, which a reload raises too
let git: Git | null = null
let isReadingGit = false
let isGitStale = false

const compact = (tokens: number) =>
  tokens >= 1_000_000
    ? `${+(tokens / 1_000_000).toFixed(1)}m`
    : tokens >= 1_000
      ? `${Math.round(tokens / 1_000)}k`
      : String(tokens)

const colorFor = (percent: number) =>
  percent >= 90 ? RED : percent >= 70 ? ORANGE : GREEN

const readGit = async ($: EngineInterface): Promise<Git | null> => {
  const head = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])

  if (head.exitCode !== 0) {
    return null
  }

  const diff = await $.process.run(['git', 'diff', '--numstat'])
  let adds = 0
  let dels = 0

  for (const line of diff.stdout.split('\n')) {
    // A binary file's counts are "-"
    const [added, deleted] = line.split('\t')
    adds += Number(added) || 0
    dels += Number(deleted) || 0
  }

  return { branch: head.stdout.trim(), adds, dels }
}

// One read at a time: a call made meanwhile asks for one more read after it
const refreshGit = async ($: EngineInterface) => {
  if (isReadingGit) {
    isGitStale = true

    return
  }

  isReadingGit = true

  try {
    do {
      isGitStale = false
      git = await readGit($).catch(() => null)
      $.ui.invalidate('ui.render')
    } while (isGitStale)
  } finally {
    isReadingGit = false
  }
}

export const register: Register = on => {
  on('session.start', ($, e, next) => {
    // Not awaited: a slow git must not hold the session's start
    void refreshGit($)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    $.ui.invalidate('ui.render')
    // Not awaited: a slow git must not hold the turn
    void refreshGit($)

    return response
  })

  on('session.measure', ($, e, next) => {
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const [model, cwd, { context, rateLimits }] = await Promise.all([
      $.session.model(),
      $.session.cwd(),
      $.session.usage(),
    ])
    const { Box, Text } = $.ui.resolve(e)
    const percent = context.percent ?? 0
    const fiveHour = rateLimits.find(limit => limit.kind === 'five_hour')

    const row = [
      <Text color={BLUE}>{model}</Text>,
      <Text dimColor>  |  </Text>,
      <Text color={CYAN}>{cwd.slice(cwd.lastIndexOf('/') + 1)}</Text>,
    ]

    if (git !== null) {
      row.push(<Text dimColor>@</Text>, <Text color={GREEN}>{git.branch}</Text>)

      if (git.adds + git.dels > 0) {
        row.push(<Text dimColor> (</Text>)
        if (git.adds > 0) row.push(<Text color={GREEN}>+{git.adds}</Text>)
        if (git.adds > 0 && git.dels > 0) row.push(<Text> </Text>)
        if (git.dels > 0) row.push(<Text color={RED}>-{git.dels}</Text>)
        row.push(<Text dimColor>)</Text>)
      }
    }

    row.push(
      <Text dimColor>  |  </Text>,
      <Text color={YELLOW}>
        {compact(context.tokens ?? 0)}/{compact(context.window)}
      </Text>,
      <Text dimColor> (</Text>,
      <Text color={colorFor(percent)}>{percent}%</Text>,
      <Text dimColor>)</Text>,
    )

    row.push(
      <Text dimColor>  |  5h </Text>,
      // No reading before the session's first response
      fiveHour === undefined ? (
        <Text dimColor>--</Text>
      ) : (
        <Text color={colorFor(fiveHour.percentUsed)}>
          {Math.round(fiveHour.percentUsed)}%
        </Text>
      ),
    )

    return <Box>{...row}</Box>
  })
}
