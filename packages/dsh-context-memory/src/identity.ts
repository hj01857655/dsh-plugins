/**
 * Memory identity.
 *
 * Ids are derived from the normalised subject rather than assigned, so remembering the
 * same thing twice folds into one memory instead of accumulating near-duplicates. A
 * counter-based id would make every repeat a new record, and the panel would fill with
 * the same fact in five slightly different phrasings.
 *
 * The subject is also what conflicts are decided on, which is why it is normalised here
 * once and shown everywhere it is used — a conflict the user cannot see the basis of is
 * not actionable.
 *
 * @module context-memory/identity
 */

import { createHash } from 'node:crypto'

/**
 * Words a statement can carry in front without changing what it claims.
 *
 * Deliberately *not* included: `never` and `always`. They read like chatter but they set
 * the polarity and the scope of the claim — "never commit secrets" and "commit secrets"
 * are opposites, so folding them into one subject lets the second overwrite the first
 * without a trace. Discourse fillers ("please", "note that", "remember that") and the
 * leading article carry nothing and are stripped.
 */
const LEADING_FILLER = /^(?:please|note that|remember that|the)\s+/i

/**
 * Strip the discourse padding in front of a statement.
 *
 * Shared with `compileGuard` on purpose. The subject is what a memory is keyed by and
 * the check is what makes it verifiable; if the two disagreed about where the actual
 * statement starts, "note that the file README.md exists" would get the subject of
 * "file README.md exists" — and no check at all, because the guard patterns are
 * anchored at the start.
 *
 * Applied repeatedly: fillers stack ("please note that the build uses pnpm"), and a
 * single pass would leave "note that …" behind.
 */
export function stripLeadingFillers(text: string): string {
  let result = text
  let previous: string
  do {
    previous = result
    result = result.replace(LEADING_FILLER, '')
  } while (result !== previous)
  return result
}

/**
 * Reduce a memory to the key it is stored and compared under.
 *
 * Lowercased, punctuation-stripped, whitespace-collapsed, and with discourse fillers and
 * a leading article dropped, so "The build uses pnpm" and "build uses pnpm" are the same
 * memory while "never commit secrets" stays a different claim from "commit secrets".
 */
export function normaliseSubject(text: string): string {
  return stripLeadingFillers(
    text
      .toLowerCase()
      .replace(/[`"'.,;:!?()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ).trim()
}

/**
 * A stable short id for a memory, derived from its subject *and* its text.
 *
 * Both parts are hashed, which is what makes conflict detection possible at all. Keying
 * on the text alone would give two disagreeing statements about one subject two
 * unrelated ids, so nothing could tell they were about the same thing; keying on the
 * subject alone would make the second statement fold into the first and silently
 * overwrite it. Hashing the pair keeps the two cases distinct: the same statement
 * repeated folds into one memory, while a different statement about the same subject
 * stays separate and is reported as a conflict.
 */
export function memoryId(subject: string, text: string): string {
  return createHash('sha256').update(`${subject}\u0000${normaliseSubject(text)}`).digest('hex').slice(0, 12)
}
