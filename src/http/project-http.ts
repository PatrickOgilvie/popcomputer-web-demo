import { Effect } from 'effect'

import { authorize, HttpError, NotFoundError } from '@popcomputer/web/effect'
import type {
  ProjectActor,
  ProjectDeleteConflict,
  ProjectIdConflict,
  ProjectLifetimeLimitReached,
  ProjectMutationCancelled,
  ProjectNotFound,
  ProjectReadCancelled,
  ProjectReadFailure,
  ProjectUpdateConflict,
} from '~/application/projects'

type ProjectHttpFailure =
  | ProjectIdConflict
  | ProjectLifetimeLimitReached
  | ProjectDeleteConflict
  | ProjectMutationCancelled
  | ProjectNotFound
  | ProjectUpdateConflict
  | ProjectReadCancelled
  | ProjectReadFailure

/** Converts project workflow failures into the framework's HTTP vocabulary. */
export function toProjectHttpFailure(
  failure: ProjectHttpFailure
): HttpError | NotFoundError {
  switch (failure._tag) {
    case 'ProjectNotFound':
      return NotFoundError.forResource('Project', failure.projectId)
    case 'ProjectIdConflict':
      return new HttpError({
        status: 409,
        message:
          'That project identifier is already in use. Reload the form and try again.',
      })
    case 'ProjectLifetimeLimitReached':
      return new HttpError({
        status: 409,
        message: `This account has reached its lifetime limit of ${failure.limit} project identifiers.`,
      })
    case 'ProjectUpdateConflict':
      return new HttpError({
        status: 409,
        message:
          'This project changed after the edit form was opened. Reload it before saving again.',
      })
    case 'ProjectDeleteConflict':
      return new HttpError({
        status: 409,
        message:
          'This project changed after the page was opened. Reload it before deleting.',
      })
    case 'ProjectStoreUnavailable':
      return new HttpError({
        status: 503,
        message: 'Project data is temporarily unavailable.',
        body: { operation: failure.operation },
      })
    case 'InvalidStoredProject':
    case 'UnexpectedProjectStoreResult':
      return new HttpError({
        status: 500,
        message: 'Stored project data is invalid.',
      })
    case 'ProjectReadCancelled':
      return new HttpError({
        status: 408,
        message: 'The project request was cancelled before it completed.',
        body: { operation: failure.operation },
      })
    case 'ProjectMutationCancelled':
      return new HttpError({
        status: 408,
        message: failure.mutationCommitted
          ? 'The project change was saved before the request was cancelled. Reload before making another change.'
          : 'The project request was cancelled before a change was saved.',
        body: {
          operation: failure.operation,
          mutationCommitted: failure.mutationCommitted,
        },
      })
  }
}

/** The authenticated owner on whose behalf project workflows run. */
export const currentProjectActor = authorize().pipe(
  Effect.map(
    (auth): ProjectActor => ({
      userId: auth.user.id,
    })
  )
)
