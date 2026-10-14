import { Head, Link, useForm } from '@inertiajs/react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import type { WebPage } from '@popcomputer/web/react'

import { buttonClassName } from '~/components/button'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import ProjectFormFields, { type ProjectFormValues } from '~/components/ProjectFormFields'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import { paths } from '~/paths'

/** Creates a project through the `createProject` action. */
const CreateProject: WebPage<'Projects/Create'> = () => {
  const formRef = useRef<HTMLFormElement>(null)
  const { data, setData, post, processing, errors, clearErrors } = useForm<ProjectFormValues>({
    name: '',
    description: null,
    visibility: 'private',
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
    post(paths.projects)
  }

  return (
    <>
      <Head title="New project" />
      <Layout>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          <PageHeader
            title="New project"
            breadcrumbs={[{ label: 'Projects', href: paths.projects }, { label: 'New' }]}
            description="You can change any of this later, including who can see it."
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
              <Link href={paths.projects} className={buttonClassName({ variant: 'ghost' })}>
                Cancel
              </Link>
              <button type="submit" disabled={processing} aria-busy={processing} className={buttonClassName()}>
                <span aria-live="polite">{processing ? 'Creating…' : 'Create project'}</span>
              </button>
            </div>
          </form>

          <UnderTheHood route="POST /projects" action="createProject" compact>
            <Guarantee>
              The fields are the form schema's, <code>ProjectForm</code>: a field it does not declare, such as
              an owner, never reaches the database.
            </Guarantee>
            <Guarantee>The project's owner is the signed-in member, whatever the form sends.</Guarantee>
            <Guarantee>D1 checks the same limits the form does, whatever writes to it.</Guarantee>
          </UnderTheHood>
        </div>
      </Layout>
    </>
  )
}

export default CreateProject
