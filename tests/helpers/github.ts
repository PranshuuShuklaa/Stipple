import type { FetchLike } from '@/server/github/github'

/**
 * Shared test helpers: a_dump fake fetch, tiny JSON response builders and
 * raw GitHub payload stubs for the data-layer unit tests.
 */

export const API = 'https://api.github.com'

export type RecordedCall = { url: string; init?: RequestInit }

export interface QueueFetch {
  fetchImpl: FetchLike
  calls: RecordedCall[]
}

/**
 * Fetch double that answers with the queued responses in order, repeating
 * the last one. Excellent for retry sequences.
 */
export function queueFetch(responses: Array<Response | (() => Response)>): QueueFetch {
  const calls: RecordedCall[] = []
  const fetchImpl: FetchLike = (input, init) => {
    calls.push({ url: String(input), init })
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]
    const response = typeof next === 'function' ? next() : next
    return Promise.resolve(response)
  }
  return { fetchImpl, calls }
}

export interface RouterFetch {
  fetchImpl: FetchLike
  calls: RecordedCall[]
}

export interface FetchRoute {
  match: (url: string) => boolean
  respond: (url: string, init?: RequestInit) => Response
}

/**
 * Fetch double that dispatches on URL. A request no route claims makes the
 * test fail fast, so mocked flow tests can't silently drift.
 */
export function routerFetch(routes: FetchRoute[]): RouterFetch {
  const calls: RecordedCall[] = []
  const fetchImpl: FetchLike = (input, init) => {
    const url = String(input)
    calls.push({ url, init })
    for (const route of routes) {
      if (route.match(url)) return Promise.resolve(route.respond(url, init))
    }
    return Promise.reject(new Error(`unexpected fetch in this test: ${url}`))
  }
  return { fetchImpl, calls }
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

export function emptyResponse(status: number = 204): Response {
  return new Response(null, { status })
}

export function headersOf(call: RecordedCall | undefined): Record<string, string> {
  return (call?.init?.headers ?? {}) as Record<string, string>
}

export function rawRepo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'hello',
    full_name: 'octo/hello',
    description: 'My first repository on GitHub!',
    default_branch: 'main',
    stargazers_count: 2153,
    html_url: 'https://github.com/octo/hello',
    pushed_at: '2026-10-10T00:00:00Z',
    license: { key: 'mit', name: 'MIT License', spdx_id: 'MIT' },
    owner: { login: 'octo' },
    ...overrides,
  }
}

export interface RawEntryStub {
  path: string
  type: 'blob' | 'tree' | 'commit'
  size?: number
}

export function rawTree(entries: RawEntryStub[], truncated = false): Record<string, unknown> {
  return {
    sha: 'tree-sha',
    truncated,
    tree: entries.map((entry) => ({
      path: entry.path,
      mode: '100644',
      type: entry.type,
      sha: `sha-${entry.path}`,
      size: entry.size ?? null,
      url: `${API}/x/blobs/${entry.path}`,
    })),
  }
}

export function rawCommunityProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    health_percentage: 100,
    description: 'My first repository on GitHub!',
    documentation: null,
    files: {
      code_of_conduct: null,
      code_of_conduct_file: null,
      contributing: { key: 'contributing', name: null, url: null },
      license: null,
      readme: { key: 'readme', name: null, url: null },
      issue_template: null,
      pull_request_template: null,
    },
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

export function base64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64')
}

/** Returns the rejection reason, failing the test when the promise resolves. */
export async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    throw new Error('expected this promise to reject, but it resolved')
  } catch (error) {
    if (error instanceof Error && error.message === 'expected this promise to reject, but it resolved') throw error
    return error
  }
}
