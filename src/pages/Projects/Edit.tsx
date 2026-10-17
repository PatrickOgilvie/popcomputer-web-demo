import { Head, Link, useForm } from '@inertiajs/react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { href } from '@popcomputer/web/paths'
import type { WebPage } from '@popcomputer/web/react'

import { buttonClassName } from '~/components/button'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import ProjectFormFields, { type ProjectFormValues } from '~/components/ProjectFormFields'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import { paths } from '~/paths'

/** Updates the member's project through the `updateProject` action. */
const EditProject: WebPage<'Projects/Edit'> = ({ project }) => {
  const formRef = useRef<HTMLFormElement>(null)
  const projectPath = href(paths.project, { project: project.id })
  const { data, setData, put, processing, errors, clearErrors } = useForm<ProjectFormValues>({
    name: project.name,
    description: project.description,
    visibility: project.visibility,
  })

  useEffect(() => {
    if (Object.keys(errors).length === 0) return
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  function updateField<Field extends keyof ProjectFormValues>(field: Field, value: ProjectFormValues[Field]) {
    setData((data) => ({ ...data, [field]: value }))
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
              { label: 'Projects', href: paths.projects },
              { label: project.name, href: projectPath },
              { label: 'Edit' },
            ]}
          />

          <form
            ref={formRef}
            noValidate
            onSubmit={handleSubmit}
            className="rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="p-5 sm:p-6">
              <ProjectFormFields data={data} errors={errors} disabled={processing} onChange={updateField} />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6 dark:border-zinc-800">
              <Link href={projectPath} className={buttonClassName({ variant: 'ghost' })}>
                Cancel
              </Link>
              <button type="submit" disabled={processing} aria-busy={processing} className={buttonClassName()}>
                <span aria-live="polite">{processing ? 'Saving…' : 'Save changes'}</span>
              </button>
            </div>
          </form>

          <UnderTheHood route="PUT /projects/{project}" action="updateProject" compact>
            <Guarantee>
              <code>bound('project')</code> loads the project the path names, and its binding is{' '}
              <code>ownedBy: 'userId'</code>: another member's project is a 404, so its existence stays private.
            </Guarantee>
            <Guarantee>The update is scoped by the bound project and its owner.</Guarantee>
          </UnderTheHood>
        </div>
      </Layout>
    </>
  )
}

export default EditProject
