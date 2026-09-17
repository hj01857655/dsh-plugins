#!/usr/bin/env node
/**
 * Executable wrapper.
 *
 * Kept separate from `src/cli.ts` so the library module has no top-level side effects:
 * importing `lib/cli.js` must not run anything, or a test that imports it would execute
 * a command.
 */

import { run } from './cli.js'

process.exitCode = run(process.argv.slice(2))
