#!/usr/bin/env node
/**
 * Executable wrapper: keeps `cli.ts` side-effect free so importing it stays safe.
 *
 * @module context-meter/bin
 */

import { run } from './cli.js'

const code = await run(process.argv, { out: line => console.log(line), err: line => console.error(line) })
process.exitCode = code
