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
 * Reduce a memory to the key it is stored and compared under.
 *
 * Lowercased, punctuation-stripped, whitespace-collapsed, and with a leading article
 * dropped, so "The build uses pnpm" and "build uses pnpm" are the same memory. Filler
 * that varies in wording but not meaning — "always", "never", "please" — is stripped
 * too: those words change how a memory is checked, not what it is about, and keeping
 * them would make the same fact conflict with itself.
 */
export function normaliseSubject(text: string): string {
  const stripped = text
    .toLowerCase()
    .replace(/[`"'.,;:!?()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:always|never|please|note that|remember that|the)\s+/i, '')
    .trim()
  // Applied repeatedly: fillers stack ("please note that the build uses pnpm"), and a
  // single pass would leave "note that …" behind, so the same fact said politely and
  // said plainly would be two subjects instead of one.
  let result = stripped
  let previous: string
  do {
    previous = result
    result = result.replace(/^(?:always|never|please|note that|remember that|the)\s+/i, '')
  } while (result !== previous)
  return result
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
