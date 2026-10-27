/**
 * CLI entry: read the meter from the command line without a browser.
 *
 * `cli.ts` only exports `run()`; `bin.ts` is the executable that calls it, so importing
 * `dsh-context-meter` never produces output as a side effect.
 *
 * @module context-meter/cli
 */

export interface CliIo {
  out(line: string): void
  err(line: string): void
}

/** Exit codes: 0 ok, 1 usage error, 2 no data. */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const args = argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    io.out('Usage: dsh-context-meter [--json]')
    io.out('')
    io.out('Prints a note about the host-side panel. The meter reads live projections inside')
    io.out('a running dsh host; the CLI exists for package smoke checks, not standalone reads.')
    return 0
  }
  io.err('dsh-context-meter reads projections inside a running dsh host; use the Settings panel or the context_meter tool.')
  return 2
}
