import { Schema as S } from 'effect'

/** Canonical UTC timestamp serialized with millisecond precision. */
export const IsoTimestamp = S.String.annotate({ format: 'date-time' }).check(
  S.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
)

/** Canonical browser timestamp string. */
export type IsoTimestamp = S.Schema.Type<typeof IsoTimestamp>
