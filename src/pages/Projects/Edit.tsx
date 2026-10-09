import { Head, Link, useForm } from '@inertiajs/react'
import { TriangleAlert } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'

import { buttonClassName } from '~/components/button'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import ProjectFormFields from '~/components/ProjectFormFields'
import type { ProjectFormValues } from '~/components/ProjectFormFields'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import type { ProjectDetail } from '~/presentation/project'

interface EditProjectProps {
  readonly project: ProjectDetail
}

interface UpdateProjectFormValues extends ProjectFormValues {
  readonly expectedRevision: number
}

/** Updates an owner-scoped project through a strict Effect action. */
export default function EditProject({ project }: EditProjectProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const projectPath = `/projects/${encodeURIComponent(project.id)}`
  const { data, setData, put, processing, errors, clearErrors } =
    useForm<UpdateProjectFormValues>({
      name: project.name,
      description: project.description,
      visibility: project.visibility,
      expectedRevision: project.revision,
    })

  useEffect(() => {
    if (Object.keys(errors).length === 0) return
    const target =
      formRef.current?.querySelector<HTMLElement>(
        'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]'
      ) ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]')
    target?.focus()
  }, [errors])

  function updateField(field: keyof ProjectFormValues, value: string) {
    switch (field) {
      case 'name':
        setData('name', value)
        break
      case 'description':
        setData('description', value)
        break
      case 'visibility':
        if (value !== 'private' && value !== 'public') return
        setData('visibility', value)
        break
    }
    clearErrors(field)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    put(projectPath)
  }

  return (
    <>
      <Head title={`Edit ${project.name}`} />
      <Layout>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          <PageHeader
            title="Edit project"
            breadcrumbs={[
              { label: 'Projects', href: '/projects' },
              { label: project.name, href: projectPath },
              { label: 'Edit' },
            ]}
            meta={<span className="tabular-nums">Editing revision {project.revision}</span>}
          />

          <form
            ref={formRef}
            noValidate
            onSubmit={handleSubmit}
            className="rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
          >
            {errors.expectedRevision ? (
              <div
                role="alert"
                tabIndex={-1}
                className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4 focus:outline-none sm:flex-row sm:items-center sm:px-6 dark:border-amber-900/60 dark:bg-amber-950/30"
              >
                <TriangleAlert
                  className="size-5 shrink-0 text-amber-700 dark:text-amber-400"
                  aria-hidden="true"
                />
                <p className="flex-1 text-sm text-pretty text-amber-900 dark:text-amber-200">
                  {errors.expectedRevision}
                </p>
                <Link
                  href={`${projectPath}/edit`}
                  className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                >
                  Load latest version
                </Link>
              </div>
            ) : null}
            <div className="p-5 sm:p-6">
              <ProjectFormFields
                data={data}
                errors={errors}
                disabled={processing}
                onChange={updateField}
              />
            </div>
            <input type="hidden" name="expectedRevision" value={data.expectedRevision} />
            <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6 dark:border-zinc-800">
              <Link href={projectPath} className={buttonClassName({ variant: 'ghost' })}>
                Cancel
              </Link>
              <button
                type="submit"
                disabled={processing}
                aria-busy={processing}
                className={buttonClassName()}
              >
                <span aria-live="polite">{processing ? 'Saving…' : 'Save changes'}</span>
              </button>
            </div>
          </form>

          <UnderTheHood route="PUT /projects/:project" name="projects.update" compact>
            <Guarantee>
              The project is found within your account before the request body is
              read.
            </Guarantee>
            <Guarantee>
              Saving sends revision {project.revision}; if someone saved a newer
              version first, this save fails instead of overwriting it.
            </Guarantee>
          </UnderTheHood>
        </div>
      </Layout>
    </>
  )
}
