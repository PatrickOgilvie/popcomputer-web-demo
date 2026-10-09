import { CircleAlert } from 'lucide-react'

/** Inline validation message announced next to the control it describes. */
export default function FieldError({
  id,
  message,
}: {
  readonly id: string
  readonly message?: string
}) {
  return message ? (
    <p
      id={id}
      className="flex items-start gap-1.5 text-sm text-pretty text-red-700 dark:text-red-400"
      aria-live="polite"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  ) : null
}
