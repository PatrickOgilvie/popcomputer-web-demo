import { AlertDialog } from '@base-ui/react/alert-dialog'
import type { ReactElement } from 'react'

import { buttonClassName } from '~/components/button'

interface ConfirmationDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Button that opens the dialog; focus returns to it when the dialog closes. */
  readonly trigger: ReactElement
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly busyLabel: string
  readonly busy?: boolean
  readonly error?: string
  readonly onConfirm: () => void
}

/**
 * Confirms a destructive or irreversible action. Base UI owns focus trapping,
 * initial focus on Cancel, Escape handling, and focus return to the trigger.
 */
export default function ConfirmationDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  busyLabel,
  busy = false,
  error,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen)
      }}
    >
      <AlertDialog.Trigger render={trigger} />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-zinc-950/40 supports-[-webkit-touch-callout:none]:absolute dark:bg-black/60" />
        <AlertDialog.Popup
          aria-busy={busy}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-xl focus-visible:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <AlertDialog.Title className="text-lg font-semibold text-balance">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-pretty text-zinc-600 dark:text-zinc-400">
            {description}
          </AlertDialog.Description>
          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-pretty text-red-800 dark:bg-red-950/50 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close
              className={buttonClassName({ variant: 'secondary' })}
              disabled={busy}
            >
              Cancel
            </AlertDialog.Close>
            <button
              type="button"
              className={buttonClassName({ variant: 'danger' })}
              disabled={busy}
              aria-busy={busy}
              onClick={onConfirm}
            >
              <span aria-live="polite">{busy ? busyLabel : confirmLabel}</span>
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
