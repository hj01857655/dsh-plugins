/**
 * Scheduled re-verification for resident hosts.
 *
 * A rule holds at the moment it was checked; promotion is an event, staying true is a
 * process. The CLI re-checks on demand and the panel re-derives on open — a resident
 * dsh host should not wait to be asked, so `apply` schedules this pass and logs the
 * one-line report.
 *
 * @module verdict/schedule
 */

import type { CheckReport } from './types.js'

/** Re-verify every six hours. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * The log line for one scheduled pass.
 *
 * Ids are named whenever something is wrong: a count alone would make the user go find
 * what broke, which is the report's job.
 */
export function formatCheckReport(report: CheckReport): string {
  const parts = [`verdict re-check: ${report.passed.length} passed`]
  if (report.violated.length > 0) {
    parts.push(`${report.violated.length} violated (${report.violated.join(', ')})`)
  }
  if (report.broken.length > 0) {
    parts.push(`${report.broken.length} broken (${report.broken.join(', ')})`)
  }
  if (report.demoted.length > 0) parts.push(`demoted: ${report.demoted.join(', ')}`)
  return parts.join(', ')
}
