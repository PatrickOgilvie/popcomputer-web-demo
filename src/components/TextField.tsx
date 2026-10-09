import { Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

import { cn } from '~/components/cn'
import FieldError from '~/components/FieldError'
import {
  fieldControlClassName,
  fieldHintClassName,
  fieldLabelClassName,
} from '~/components/fieldStyles'

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  readonly label: string
  readonly error?: string
  readonly hint?: string
  /** Optional content aligned with the label, such as a counter or link. */
  readonly labelAside?: ReactNode
}

/** Renders a labelled input with consistent help, error, and password states. */
export default function TextField({
  label,
  error,
  hint,
  labelAside,
  id: providedId,
  type = 'text',
  'aria-describedby': describedByProp,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const isPassword = type === 'password'
  const [showsPassword, setShowsPassword] = useState(false)

  const describedBy =
    [describedByProp, hint ? hintId : undefined, error ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className={fieldLabelClassName}>
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          {...inputProps}
          id={id}
          type={isPassword && showsPassword ? 'text' : type}
          className={cn(fieldControlClassName, 'h-10', isPassword && 'pr-11')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {isPassword ? (
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-zinc-500 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-orange-600 dark:hover:text-white"
            aria-label={showsPassword ? 'Hide password' : 'Show password'}
            aria-controls={id}
            aria-pressed={showsPassword}
            onClick={() => setShowsPassword((visible) => !visible)}
          >
            {showsPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className={fieldHintClassName}>
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  )
}
