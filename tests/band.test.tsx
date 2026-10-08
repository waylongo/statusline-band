import type { On, SessionContextUsage, SessionRateLimit } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'statusline-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

const START = { cwd: '/work/app', surface: 'terminal', isInteractive: true } as const

type Session = {
  context: SessionContextUsage
  // null outside a repository
  branch: string | null
  numstat: string
  rateLimits?: SessionRateLimit[]
}

type Taps = {
  onStart?: () => void
  // git answers once this settles
  beforeRun?: (argv: readonly string[]) => Promise<void> | void
  afterRun?: (argv: readonly string[]) => void
}

// What the engine answers beneath the mod, read from `session` at each call
const answer = (on: On, session: Session, taps: Taps = {}) => {
  on('session.start', (_$, e) => {
    taps.onStart?.()

    return { cwd: e.cwd }
  })
  on('session.model', () => ({ value: 'Opus 5.5' }))
  on('session.cwd', () => ({ value: START.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      rateLimits: session.rateLimits ?? [],
      context: session.context,
    },
  }))
  on('process.run', async (_$, e) => {
    await taps.beforeRun?.(e.argv)
    const isHead = e.argv[1] === 'rev-parse'
    const value = {
      exitCode: isHead && session.branch === null ? 128 : 0,
      stdout: isHead ? `${session.branch}\n` : session.numstat,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    }
    taps.afterRun?.(e.argv)

    return { value }
  })
}

const drain = async (stream: AsyncIterable<unknown>) => {
  for await (const _chunk of stream) {
    // the response is read to its end
  }
}

const gate = () => {
  let open = () => {}
  const opened = new Promise<void>(resolve => {
    open = resolve
  })

  return { open, opened }
}

test('draws what the CLI status line draws', async ($, on) => {
  answer(on, {
    context: { tokens: 84_300, window: 200_000, percent: 42 },
    branch: 'main',
    numstat: '12\t3\ta.ts\n-\t-\tb.png\n1\t0\tc.ts\n',
    rateLimits: [
      { kind: 'seven_day', percentUsed: 80 },
      { kind: 'five_hour', percentUsed: 36.6 },
    ],
  })
  await $.session.start(START)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const colorOf = async (text: RegExp) =>
      (await ui.find({ type: 'Text', text }))?.props.color

    expect(await colorOf(/^Opus 5\.5$/)).toBe('#268bd2')
    expect(await colorOf(/^app$/)).toBe('#2aa198')
    expect(await colorOf(/^main$/)).toBe('#859900')
    expect(await colorOf(/^\+13$/)).toBe('#859900')
    expect(await colorOf(/^-3$/)).toBe('#dc322f')
    expect(await colorOf(/^84k\/200k$/)).toBe('#b58900')
    expect(await colorOf(/^42%$/)).toBe('#859900')
    expect(await ui.find({ type: 'Text', text: /^  \|  5h $/ })).toBeDefined()
    expect(await colorOf(/^37%$/)).toBe('#859900')
    await ui.unmount()
  }
})

test('leaves the branch out outside a repository', async ($, on) => {
  answer(on, { context: { window: 1_000_000 }, branch: null, numstat: '' })
  await $.session.start(START)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Text', text: /^app$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^@$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^0\/1m$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^0%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^  \|  5h $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^--$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('leaves the counts out of a clean tree', async ($, on) => {
  answer(on, { context: { window: 200_000 }, branch: 'main', numstat: '' })
  await $.session.start(START)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /^main$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\+/ })).toBeUndefined()
})

test('yields the band to a survey', async ($, on) => {
  answer(on, { context: { window: 200_000 }, branch: 'main', numstat: '' })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>survey</Text>
  })

  const ui = await $.ui.mount({
    ...BAND,
    surface: 'terminal',
    props: { ...BAND.props, hasSurvey: true },
  })

  expect(await ui.find({ type: 'Text', text: /survey/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Opus/ })).toBeUndefined()
})

test('draws again when the session measures a move', async ($, on) => {
  const session: Session = {
    context: { window: 200_000 },
    branch: 'main',
    numstat: '',
  }
  answer(on, session)
  on('session.measure', (_$, e) => ({ changed: [...e.changed] }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  session.context = { tokens: 150_000, window: 200_000, percent: 75 }
  session.rateLimits = [{ kind: 'five_hour', percentUsed: 92 }]
  await $.session.measure({
    context: session.context,
    rateLimits: session.rateLimits,
    changed: ['context', 'rateLimits'],
  })

  expect((await ui.find({ type: 'Text', text: /^75%$/ }))?.props.color).toBe(
    '#cb4b16',
  )
  expect((await ui.find({ type: 'Text', text: /^92%$/ }))?.props.color).toBe(
    '#dc322f',
  )
})

test('reads the fill and git again after each model response', async ($, on) => {
  const session: Session = {
    context: { window: 200_000 },
    branch: 'main',
    numstat: '',
  }
  answer(on, session)
  on('turn.step', async function* (_$, e) {
    session.context = { tokens: 130_000, window: 200_000, percent: 65 }
    session.numstat = '5\t0\ta.ts\n'

    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: null,
    }
  })
  await $.session.start(START)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await drain(
    $.turn.step({ turnId: 'turn', index: 0, model: 'model', messageCount: 1 }),
  )

  expect(await ui.find({ type: 'Text', text: /^65%$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\+5$/ })).toBeDefined()
})

test('starts the session without waiting for git', async ($, on) => {
  const git = gate()
  // git answers only once the session has started
  answer(
    on,
    { context: { window: 200_000 }, branch: 'main', numstat: '' },
    { beforeRun: () => git.opened, onStart: git.open },
  )

  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /^main$/ })).toBeDefined()
})

test('reads git one at a time, then once more for what came meanwhile', async ($, on) => {
  const session: Session = {
    context: { window: 200_000 },
    branch: 'main',
    numstat: '',
  }
  const git = gate()
  const firstRead = gate()
  const lastRead = gate()
  let reads = 0
  let running = 0
  let peak = 0
  answer(on, session, {
    beforeRun: argv => {
      if (argv[1] !== 'rev-parse') return

      reads += 1
      running += 1
      peak = Math.max(peak, running)
      firstRead.open()

      return git.opened
    },
    afterRun: argv => {
      if (argv[1] !== 'diff') return

      running -= 1
      if (reads === 2) lastRead.open()
    },
  })
  on('turn.step', async function* (_$, e) {
    session.numstat = `${e.index + 1}\t0\ta.ts\n`

    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: null,
    }
  })
  const step = (index: number) =>
    drain($.turn.step({ turnId: 'turn', index, model: 'model', messageCount: 1 }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const first = step(0)
  await firstRead.opened
  await step(1)
  await step(2)
  git.open()
  await first
  await lastRead.opened

  expect(reads).toBe(2)
  expect(peak).toBe(1)
  expect(await ui.find({ type: 'Text', text: /^\+3$/ })).toBeDefined()
})
