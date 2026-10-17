import { and, desc, eq } from 'drizzle-orm'
import { DateTime, Effect } from 'effect'
import {
  action,
  authorize,
  bound,
  dbMutation,
  dbQuery,
  flash,
  redirect,
  render,
  validateRequest,
} from '@popcomputer/web/effect'
import { columnsOf } from '@popcomputer/web/schema'
import { ProjectForm } from '../forms'
import { ProjectSummary } from '../pages'
import { paths } from '../paths'
import { projects } from '../schema'

export const listProjects = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    const rows = yield* dbQuery((db) =>
      db.select(columnsOf(projects, ProjectSummary))
        .from(projects)
        .where(eq(projects.userId, auth.user.id))
        .orderBy(desc(projects.updatedAt))
    )

    return yield* render('Projects/Index', { projects: rows })
  })
)

export const createProject = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    const input = yield* validateRequest(ProjectForm)
    const [created] = yield* dbMutation((db) =>
      db.insert(projects).values({ ...input, userId: auth.user.id }).returning({ id: projects.id })
    )

    if (created === undefined) return yield* Effect.die(new Error('The project insert returned no row.'))

    yield* flash('success', 'Project created.')

    return yield* redirect(paths.project, { project: created.id })
  })
)

// `{project}` loads only the signed-in member's own project (its binding in
// src/app.ts is ownedBy 'userId'): another member's is not found, so its
// existence stays private.
export const showProject = action(
  Effect.gen(function* () {
    return yield* render('Projects/Show', { project: yield* bound('project') })
  })
)

export const editProject = action(
  Effect.gen(function* () {
    return yield* render('Projects/Edit', { project: yield* bound('project') })
  })
)

export const updateProject = action(
  Effect.gen(function* () {
    const project = yield* bound('project')
    const input = yield* validateRequest(ProjectForm)
    const updatedAt = DateTime.toDateUtc(yield* DateTime.now)

    yield* dbMutation((db) =>
      db.update(projects)
        .set({ ...input, updatedAt })
        .where(and(eq(projects.id, project.id), eq(projects.userId, project.userId)))
    )
    yield* flash('success', 'Project saved.')

    return yield* redirect(paths.project, { project: project.id })
  })
)

export const deleteProject = action(
  Effect.gen(function* () {
    const project = yield* bound('project')

    yield* dbMutation((db) =>
      db.delete(projects).where(and(eq(projects.id, project.id), eq(projects.userId, project.userId)))
    )
    yield* flash('success', `Deleted ${project.name}.`)

    return yield* redirect(paths.projects)
  })
)

/**
 * A project its owner made public, for anyone: `{publicProject}` binds the
 * same table with publicWhen, so a private one is not found.
 */
export const showPublicProject = action(
  Effect.gen(function* () {
    return yield* render('Projects/Public', { project: yield* bound('publicProject') })
  })
)
