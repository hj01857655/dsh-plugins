/**
 * Command-line entry.
 *
 * The same modules the host uses, reachable without booting dsh — so what the plugin
 * claims about a project can be checked independently, and `verify` can run in CI.
 *
 * @module context-memory/cli
 */

import { parseArgs } from 'node:util'

import { ContextMemory } from './memory.js'

export function run(argv: string[]): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      subject: { type: 'string' },
      kind: { type: 'string' },
      source: { type: 'string' },
    },
  })
  const memory = new ContextMemory(process.cwd())
  const cmd = positionals[0] ?? 'list'

  switch (cmd) {
    case 'remember': {
      const text = positionals.slice(1).join(' ')
      if (text.trim().length === 0) {
        console.log('Usage: dsh-context-memory remember "<statement>" [--subject <what it is about>]')
        return 1
      }
      // `--subject` is what makes a conflict expressible from the command line: two
      // different statements about one thing stay separate records instead of folding.
      const stored = memory.remember({
        text,
        ...(values['subject'] !== undefined ? { subject: String(values['subject']) } : {}),
        ...(values['kind'] !== undefined ? { kind: String(values['kind']) as 'fact' } : {}),
        ...(values['source'] !== undefined ? { source: String(values['source']) as 'user' } : {}),
      })
      const guard = stored.guard ? ` (guard: ${stored.guard.command})` : ' (no check could be compiled)'
      console.log(`Remembered ${stored.id}: ${stored.text}${guard}`)
      // A memory with no executable check is recorded, and the caller is told plainly
      // that nothing will verify it — rather than reporting a success that implies more.
      return 0
    }

    case 'list': {
      const active = memory.active()
      if (active.length === 0) {
        console.log('No memories recorded.')
        return 0
      }
      for (const item of active) {
        const mark = item.verification?.outcome === 'passed' ? '✓' : item.verification ? '✗' : '·'
        console.log(`${mark} ${item.id}  ${item.text}`)
      }
      return 0
    }

    case 'recall': {
      const query = positionals.slice(1).join(' ')
      if (query.trim().length === 0) {
        console.log('Usage: dsh-context-memory recall "<query>"')
        return 1
      }
      const hits = memory.recall(query)
      if (hits.length === 0) {
        console.log('Nothing relevant is remembered.')
        return 0
      }
      for (const hit of hits) {
        console.log(`${hit.score.toFixed(3)}  ${hit.memory.text}`)
        console.log(`         ${hit.why}`)
      }
      return 0
    }

    case 'forget': {
      const id = positionals[1] ?? ''
      const reason = positionals.slice(2).join(' ')
      if (id.length === 0 || reason.trim().length === 0) {
        console.log('Usage: dsh-context-memory forget <id> "<reason>"')
        console.log('A reason is required: a superseded memory is kept as the record of why it stopped being true.')
        return 1
      }
      const ok = memory.forget(id, reason)
      console.log(ok ? `Superseded ${id}: ${reason}` : `No memory with id ${id}`)
      return ok ? 0 : 1
    }

    case 'conflicts': {
      const conflicts = memory.conflicts()
      if (conflicts.length === 0) {
        console.log('No conflicts.')
        return 0
      }
      for (const conflict of conflicts) {
        console.log(`Subject: ${conflict.subject}`)
        for (const item of conflict.memories) console.log(`  - ${item.id}: ${item.text}`)
      }
      // A conflict is a question for the user, not a failure of this command.
      return 0
    }

    case 'verify': {
      const summary = memory.verify()
      for (const result of summary.results) {
        console.log(`${result.outcome.padEnd(11)} ${result.id}  ${result.text}`)
        if (result.outcome === 'broken' && result.output.trim().length > 0) {
          console.log(`            the check could not run: ${result.output.trim().split('\n')[0]}`)
        }
      }
      console.log(
        `\npassed ${summary.passed}, violated ${summary.violated}, broken ${summary.broken}, uncheckable ${summary.uncheckable}`,
      )
      if (summary.broken > 0) {
        console.log('broken guards are a defect in the check, not a memory that is wrong — they do not fail this command')
      }
      return ContextMemory.exitCode(summary)
    }

    case 'help':
    default:
      console.log('Usage: dsh-context-memory <command>')
      console.log('Commands:')
      console.log('  remember "<statement>"        record a memory and compile a check if possible')
      console.log('    --subject <what it is about>  make a later disagreeing statement a conflict')
      console.log('    --kind <fact|decision|preference|pitfall>')
      console.log('    --source <user|agent|plugin>')
      console.log('  list                          active memories, with verification status')
      console.log('  recall "<query>"              rank memories by relevance')
      console.log('  forget <id> "<reason>"        retire a memory, keeping the reason')
      console.log('  conflicts                     active memories that disagree')
      console.log('  verify                        re-run every compiled check; exit 1 only on a real violation')
      return 0
  }
}
