import { Globe, Lock } from 'lucide-react'

import { cn } from '~/components/cn'
import FieldError from '~/components/FieldError'
import {
  fieldControlClassName,
  fieldHintClassName,
  fieldLabelClassName,
} from '~/components/fieldStyles'
import TextField from '~/components/TextField'
import type { ProjectSummary } from '~/presentation/project'

const NAME_LIMIT = 100
const DESCRIPTION_LIMIT = 500

/** Editable values shared by the create and update project forms. */
export interface ProjectFormValues {
  readonly name: string
  readonly description: string
  readonly visibility: ProjectSummary['visibility']
}

interface ProjectFormFieldsProps {
  readonly data: ProjectFormValues
  readonly errors: Partial<Record<keyof ProjectFormValues, string>>
  readonly disabled: boolean
  readonly onChange: <Field extends keyof ProjectFormValues>(
    field: Field,
    value: ProjectFormValues[Field]
  ) => void
}

const visibilityOptions = [
  {
    value: 'private',
    label: 'Private',
    description: 'Only you can open it while signed in.',
    icon: Lock,
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone with the showcase link can read it.',
    icon: Globe,
  },
] as const

function Counter({ length, limit }: { readonly length: number; readonly limit: number }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        length > limit * 0.9 ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500'
      )}
      aria-hidden="true"
    >
      {length}/{limit}
    </span>
  )
}

/** Renders the accessible fields shared by project create and edit journeys. */
export default function ProjectFormFields({
  data,
  errors,
  disabled,
  onChange,
}: ProjectFormFieldsProps) {
  const descriptionHintId = 'project-description-hint'
  const descriptionErrorId = 'project-description-error'
  const visibilityErrorId = 'project-visibility-error'

  return (
    <div className="flex flex-col gap-6">
      <TextField
        id="project-name"
        name="name"
        type="text"
        label="Name"
        autoComplete="off"
        maxLength={NAME_LIMIT}
        required
        disabled={disabled}
        value={data.name}
        error={errors.name}
        labelAside={<Counter length={data.name.length} limit={NAME_LIMIT} />}
        onChange={(event) => onChange('name', event.target.value)}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="project-description" className={fieldLabelClassName}>
            Description{' '}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
          </label>
          <Counter length={data.description.length} limit={DESCRIPTION_LIMIT} />
        </div>
        <textarea
          id="project-description"
          name="description"
          rows={4}
          maxLength={DESCRIPTION_LIMIT}
          disabled={disabled}
          value={data.description}
          className={cn(fieldControlClassName, 'min-h-28 resize-y py-2 text-pretty')}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={
            errors.description
              ? `${descriptionHintId} ${descriptionErrorId}`
              : descriptionHintId
          }
          onChange={(event) => onChange('description', event.target.value)}
        />
        <p id={descriptionHintId} className={fieldHintClassName}>
          Shown on the project page and, when public, on its showcase page.{' '}
          <span className="sr-only">Up to {DESCRIPTION_LIMIT} characters.</span>
        </p>
        <FieldError id={descriptionErrorId} message={errors.description} />
      </div>

      <fieldset
        className="flex flex-col gap-2"
        disabled={disabled}
        aria-invalid={errors.visibility ? true : undefined}
        aria-describedby={errors.visibility ? visibilityErrorId : undefined}
      >
        <legend className={cn(fieldLabelClassName, 'mb-2')}>Visibility</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibilityOptions.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 rounded-lg border border-zinc-300 bg-white p-4 shadow-xs hover:border-zinc-400 has-checked:border-zinc-950 has-checked:ring-1 has-checked:ring-zinc-950 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-orange-600 has-disabled:cursor-not-allowed has-disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500 dark:has-checked:border-white dark:has-checked:ring-white"
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={data.visibility === option.value}
                aria-invalid={errors.visibility ? true : undefined}
                className="mt-0.5 size-4 shrink-0 accent-zinc-950 focus-visible:outline-none dark:accent-white"
                onChange={() => onChange('visibility', option.value)}
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <option.icon className="size-4 text-zinc-500" aria-hidden="true" />
                  {option.label}
                </span>
                <span className="text-sm text-pretty text-zinc-600 dark:text-zinc-400">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id={visibilityErrorId} message={errors.visibility} />
      </fieldset>
    </div>
  )
}
