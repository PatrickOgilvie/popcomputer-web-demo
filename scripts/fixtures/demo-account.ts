/**
 * Local-only accounts for walking the UI against `bun run dev`.
 * They exist only in the local D1 database; never reuse them elsewhere.
 */
export const DEMO_ACCOUNT = {
  name: 'Ada Lovelace',
  email: 'ada@popcomputer.test',
  password: 'KYG5INhrgavxhFEm3FB9',
} as const

/** A second account that keeps no projects, for first-run and empty states. */
export const EMPTY_ACCOUNT = {
  name: 'Grace Hopper',
  email: 'grace@popcomputer.test',
  password: 'AajNbhjivSjs0qw6w65F',
} as const
