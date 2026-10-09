import { describe, expect, test } from 'bun:test'
import { Schema as S } from 'effect'

import { Project } from '~/domain/project'
import { ManagedSession } from '~/domain/session'
import {
  DashboardProps,
  RECENT_PROJECT_LIMIT,
  toDashboardProps,
} from '~/presentation/dashboard'

const ownerId = '00000000-0000-4000-8000-0000000000aa'

function makeProject(
  index: number,
  visibility: 'private' | 'public',
  updatedAt: string
) {
  return S.decodeUnknownSync(Project)({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    userId: ownerId,
    name: `Project ${index}`,
    description: '',
    visibility,
    revision: 1,
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    updatedAt: new Date(updatedAt),
    deletedAt: null,
  })
}

function makeSession(id: string, isCurrent: boolean) {
  return S.decodeUnknownSync(ManagedSession)({
    id,
    createdAt: new Date('2026-10-09T09:00:00.000Z'),
    updatedAt: new Date('2026-10-09T10:00:00.000Z'),
    expiresAt: new Date('2026-10-16T09:00:00.000Z'),
    ipAddress: null,
    userAgent: null,
    isCurrent,
  })
}

describe('dashboard presentation', () => {
  test('counts projects by visibility and lists the most recently updated', () => {
    const projects = [
      makeProject(1, 'private', '2026-10-02T10:00:00.000Z'),
      makeProject(2, 'public', '2026-10-05T10:00:00.000Z'),
      makeProject(3, 'public', '2026-10-03T10:00:00.000Z'),
      makeProject(4, 'private', '2026-10-08T10:00:00.000Z'),
    ]

    const props = toDashboardProps(projects, [])

    expect(props.projects).toMatchObject({ total: 4, public: 2, private: 2 })
    expect(props.projects.recent.map((project) => project.name)).toEqual([
      'Project 4',
      'Project 2',
      'Project 3',
    ])
    expect(props.projects.recent).toHaveLength(RECENT_PROJECT_LIMIT)
    expect(S.is(DashboardProps)(props)).toBe(true)
  })

  test('exposes the current session without provider fields', () => {
    const props = toDashboardProps(
      [],
      [makeSession('session-other', false), makeSession('session-current', true)]
    )

    expect(props.sessions.active).toBe(2)
    expect(String(props.sessions.current?.id)).toBe('session-current')
    expect(props.sessions.current && 'token' in props.sessions.current).toBe(false)
    expect(props.projects).toEqual({ total: 0, public: 0, private: 0, recent: [] })
  })

  test('reports no current session when the provider view omits it', () => {
    const props = toDashboardProps([], [makeSession('session-other', false)])

    expect(props.sessions.current).toBeNull()
  })
})
