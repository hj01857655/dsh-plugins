/**
 * Command-line entry.
 *
 * The same modules the host uses, reachable without booting dsh — so what the plugin
 * claims about a project can be checked independently, and `verify` can run in CI.
 *
 * @module context-memory/cli
 */

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parseArgs } from 'node:util'

import { describeContradiction, describeGuard } from './guard.js'
import { ContextMemory } from './memory.js'
import { resolveProjectStore, userStoreDir } from './scope.js'

export function run(argv: string[]): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      subject: { type: 'string' },
      kind: { type: 'string' },
      scope: { type: 'string' },
      source: { type: 'string' },
      global: { type: 'boolean' },
    },
  })
  // The CLI runs outside a session, so its launch directory is the only working
  // directory it can know. `resolveProjectStore` still climbs to the project root, which
  // is what makes `cd packages/x && dsh-context-memory list` see the same log as the root.
  const root = resolveProjectStore()
  const memory = new ContextMemory(root, { userDir: userStoreDir() })
  const cmd = positionals[0] ?? 'list'

  switch (cmd) {
    case 'remember': {
      const text = positionals.slice(1).join(' ')
      if (text.trim().length === 0) {
        console.log('Usage: dsh-context-memory remember "<statement>" [--subject <what it is about>] [--global]')
        return 1
      }
      // `--global` records a working preference that follows the user across projects;
      // the default is the narrow claim, because most statements are about one checkout.
      const scope = values['global'] === true || values['scope'] === 'user' ? 'user' : 'project'
      // `--subject` is what makes a conflict expressible from the command line: two
      // different statements about one thing stay separate records instead of folding.
      const stored = memory.remember({
        text,
        scope,
        ...(values['subject'] !== undefined ? { subject: String(values['subject']) } : {}),
        ...(values['kind'] !== undefined ? { kind: String(values['kind']) as 'fact' } : {}),
        ...(values['source'] !== undefined ? { source: String(values['source']) as 'user' } : {}),
      })
      const guard = stored.guard ? ` (check: ${describeGuard(stored.guard)})` : ' (no check could be compiled)'
      console.log(`Remembered ${stored.id} [${stored.scope}]: ${stored.text}${guard}`)
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
        const mark = item.verification?.outcome === 'passed'
          ? '✓'
          : item.verification?.outcome === 'violated'
            ? '!'
            : item.verification ? '✗' : '·'
        console.log(`${mark} ${item.id} [${item.scope ?? 'project'}]  ${item.text}`)
      }
      const contradicted = active.filter((item) => item.verification?.outcome === 'violated')
      if (contradicted.length > 0) {
        console.log(`\n${contradicted.length} memor${contradicted.length === 1 ? 'y' : 'ies'} contradicted by a check — not offered as guidance.`)
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
      // `--scope` disambiguates the one case the id alone cannot: the same sentence held
      // in both logs has one id and two rows, and retiring "the" memory would be whichever
      // log the fold listed first.
      const scope = values['scope'] === 'user' || values['scope'] === 'project' ? values['scope'] : undefined
      const ok = memory.forget(id, reason, scope === undefined ? {} : { scope })
      console.log(ok ? `Superseded ${id}: ${reason}` : `No memory with id ${id}${scope === undefined ? '' : ` in the ${scope} log`}`)
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
        // A check that ran and came back false reports no output of its own; without the
        // operand it tested, "violated" is a verdict the reader cannot act on. The guard
        // rides along on the result — looking it up here would re-fold the whole log once
        // per violated memory, and the number of those is unbounded.
        if (result.outcome === 'violated') {
          console.log(`            contradicted: ${describeContradiction(result.guard, result.output)}`)
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

    case 'candidates': {
      const pending = memory.candidates()
      if (pending.length === 0) {
        console.log('No candidates waiting. (These come from ordinary declarative statements and from the turn-end harvest; they are never remembered without being accepted.)')
        return 0
      }
      for (const candidate of pending) {
        // The origin is printed because it is what a reviewer weighs: a tool's error line
        // and a sentence the person typed are different evidence, and the text alone does
        // not say which one this is.
        const origin = candidate.origin === 'turn-harvest'
          ? `harvest${candidate.reason === undefined ? '' : `/${candidate.reason}`}`
          : 'words'
        console.log(`${candidate.id}  [${candidate.kind}]  (${origin})  ${candidate.text}`)
      }
      console.log(`\n${pending.length} candidate${pending.length === 1 ? '' : 's'} — accept with \`accept <id>\`, decline with \`dismiss <id>\`.`)
      return 0
    }

    case 'accept': {
      const id = positionals[1] ?? ''
      if (id.length === 0) {
        console.log('Usage: dsh-context-memory accept <candidate id> [--kind <kind>] [--global]')
        return 1
      }
      const scope = values['global'] === true || values['scope'] === 'user' ? 'user' : 'project'
      const stored = memory.accept(id, {
        scope,
        ...(values['kind'] !== undefined ? { kind: String(values['kind']) as 'fact' } : {}),
      })
      if (stored === undefined) {
        console.log(`No pending candidate with id ${id}`)
        return 1
      }
      console.log(`Remembered ${stored.id}: ${stored.text}`)
      return 0
    }

    case 'dismiss': {
      const id = positionals[1] ?? ''
      if (id.length === 0) {
        console.log('Usage: dsh-context-memory dismiss <candidate id>')
        return 1
      }
      const ok = memory.dismiss(id)
      console.log(ok ? `Dismissed ${id}` : `No pending candidate with id ${id}`)
      return ok ? 0 : 1
    }

    case 'export': {
      const target = positionals[1] ?? ''
      if (target.length === 0) {
        console.log('Usage: dsh-context-memory export <file> [--scope project|user]')
        return 1
      }
      // The user-global log is the one that most needs a backup: it holds the preferences
      // that apply everywhere, and it is the only log a project checkout cannot carry.
      const scope = values['scope'] === 'user' || values['global'] === true ? 'user' : 'project'
      const source = scope === 'user' ? memory.locations.user : memory.locations.project
      if (source === undefined) {
        console.log('This instance has no user-global log to export.')
        return 1
      }
      if (!existsSync(source)) {
        console.log(`No ${scope} log to export at ${source}`)
        return 1
      }
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(source, target)
      const lines = readFileSync(target, 'utf8').split('\n').filter((line) => line.trim().length > 0).length
      console.log(`Exported ${lines} ${scope} event${lines === 1 ? '' : 's'} from ${source} to ${target}`)
      return 0
    }

    case 'import': {
      const source = positionals[1] ?? ''
      if (source.length === 0) {
        console.log('Usage: dsh-context-memory import <file> [--scope project|user]')
        return 1
      }
      if (!existsSync(source)) {
        console.log(`No such file: ${source}`)
        return 1
      }
      const scope = values['scope'] === 'user' || values['global'] === true ? 'user' : 'project'
      const target = scope === 'user' ? memory.locations.user : memory.locations.project
      if (target === undefined) {
        console.log('This instance has no user-global log to import into.')
        return 1
      }
      // Events are folded by id, so a re-import of an overlapping backup is a no-op for
      // memories the project already has: same id → same subject+text → the fold keeps
      // one record. Only genuinely new events extend the log. The check spans BOTH scopes:
      // a statement the user already declared global must not also land in this project.
      const imported = readFileSync(source, 'utf8').split('\n').filter((line) => line.trim().length > 0)
      const knownIds = new Set(memory.all().map((item) => item.id))
      mkdirSync(dirname(target), { recursive: true })
      let appended = 0
      let skipped = 0
      for (const line of imported) {
        let event: { type?: string; memory?: { id?: string } ; id?: string }
        try {
          event = JSON.parse(line)
        } catch {
          skipped += 1
          continue
        }
        const involved = event.type === 'remember' ? event.memory?.id : event.id
        if (typeof involved === 'string' && knownIds.has(involved)) {
          skipped += 1
          continue
        }
        if (typeof involved === 'string') knownIds.add(involved)
        appendFileSync(target, `${JSON.stringify(event)}\n`, 'utf8')
        appended += 1
      }
      console.log(`Imported ${appended} event${appended === 1 ? '' : 's'} into ${target}${skipped > 0 ? ` (${skipped} already known or malformed, skipped)` : ''}`)
      return 0
    }

    case 'help':
    default:
      console.log('Usage: dsh-context-memory <command>')
      console.log('Commands:')
      console.log('  remember "<statement>"        record a memory and compile a check if possible')
      console.log('    --subject <what it is about>  make a later disagreeing statement a conflict')
      console.log('    --scope <project|user>        which log to write (default project)')
      console.log('    --global                      shorthand for --scope user')
      console.log('    --kind <fact|decision|preference|pitfall>')
      console.log('    --source <user|agent|plugin>')
      console.log('  list                          active memories, with scope and verification status')
      console.log('  recall "<query>"              rank memories by relevance')
      console.log('  forget <id> "<reason>"        retire a memory, keeping the reason')
      console.log('  conflicts                     active memories that disagree')
      console.log('  candidates                    statements noticed but not remembered')
      console.log('  accept <candidate id>         turn a candidate into a memory')
      console.log('  dismiss <candidate id>        decline a candidate, keeping the answer')
      console.log('  verify                        re-run every compiled check; exit 1 only on a real violation')
      console.log('  export <file>                 copy the project log to a backup file (--scope user for the global log)')
      console.log('  import <file>                 merge events from a backup into the project log (--scope user for the global log)')
      console.log(`\nproject log: ${memory.locations.project}`)
      if (memory.locations.user) console.log(`user log:    ${memory.locations.user}`)
      return 0
  }
}
