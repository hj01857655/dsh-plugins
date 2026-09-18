/**
 * Types for dsh-context-memory.
 *
 * The split between `Memory` (what was recorded) and `MemoryState` (what is currently
 * true of it) mirrors the store: `Memory` is the immutable payload of a `remember`
 * event, `MemoryState` is that payload folded together with every later event about it.
 * Nothing in this plugin mutates a recorded memory — a memory stops being active
 * because a later event says so, never because a field was overwritten.
 *
 * @module context-memory/types
 */
export {};
