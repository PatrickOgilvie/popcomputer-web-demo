import { Head, Link, useForm } from '@inertiajs/react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'

import { buttonClassName } from '~/components/button'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import ProjectFormFields from '~/components/ProjectFormFields'
import type { ProjectFormValues } from '~/components/ProjectFormFields'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'

interface CreateProjectForm extends ProjectFormValues {
  readonly id: string
}

/** Creates a project through the schema-validated Effect action. */
export default function CreateProject() {
  const formRef = useRef<HTMLFormElement>(null)
  const { data, setData, post, processing, errors, clearErrors } =
    useForm<CreateProjectForm>(() => ({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      visibility: 'private',
    }))

  useEffect(() => {
    if (Object.keys(errors).length === 0) return
    formRef.current
      ?.querySelector<HTMLElement>(
        'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]'
      )
      ?.focus()
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
    post('/projects')
  }

  return (
    <>
      <Head title="New project" />
      <Layout>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          <PageHeader
            title="New project"
            breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: 'New' }]}
            description="You can change any of this later, including who can see it."
          />

          <form
            ref={formRef}
            noValidate
            onSubmit={handleSubmit}
            className="rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="p-5 sm:p-6">
              <ProjectFormFields
                data={data}
                errors={errors}
                disabled={processing}
                onChange={updateField}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6 dark:border-zinc-800">
              <Link href="/projects" className={buttonClassName({ variant: 'ghost' })}>
                Cancel
              </Link>
              <button
                type="submit"
                disabled={processing}
                aria-busy={processing}
                className={buttonClassName()}
              >
                <span aria-live="polite">{processing ? 'Creating…' : 'Create project'}</span>
              </button>
            </div>
          </form>

          <UnderTheHood route="POST /projects" name="projects.store" compact>
            <Guarantee>
              The form carries a client-generated ID, so a retried submit never
              creates a duplicate.
            </Guarantee>
            <Guarantee>
              Unknown fields are rejected and bodies over 8 KiB are refused before
              parsing.
            </Guarantee>
            <Guarantee>D1 caps each account at 100 project IDs over its lifetime.</Guarantee>
          </UnderTheHood>
        </div>
      </Layout>
    </>
  )
}
