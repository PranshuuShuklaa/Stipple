import { describe, expect, it } from 'vitest'
import { parseRepoInput } from '@/features/scan-form/normalize'

describe('parseRepoInput', () => {
  const ok = (input: string, owner: string, repo: string) =>
    it(`parses ${input}`, () => {
      expect(parseRepoInput(input)).toEqual({ owner, repo })
    })

  const bad = (input: string) =>
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(parseRepoInput(input)).toBeNull()
    })

  // shorthands
  ok('facebook/react', 'facebook', 'react')
  ok('  facebook/react  ', 'facebook', 'react')
  ok('expressjs/express', 'expressjs', 'express')

  // URLs, with and without scheme, extra path, query, fragment, trailing slash
  ok('https://github.com/facebook/react', 'facebook', 'react')
  ok('http://github.com/facebook/react', 'facebook', 'react')
  ok('https://www.github.com/facebook/react', 'facebook', 'react')
  ok('github.com/facebook/react', 'facebook', 'react')
  ok('https://github.com/facebook/react/', 'facebook', 'react')
  ok('https://github.com/facebook/react/tree/main', 'facebook', 'react')
  ok('https://github.com/facebook/react/blob/main/package.json', 'facebook', 'react')
  ok('https://github.com/facebook/react?tab=readme', 'facebook', 'react')
  ok('https://github.com/facebook/react#readme', 'facebook', 'react')
  ok('HTTPS://github.com/Facebook/React', 'Facebook', 'React')
  ok('github.com/octocat/.github', 'octocat', '.github')

  // invalid shorthands
  bad('')
  bad('     ')
  bad('facebook')
  bad('facebook/')
  bad('/react')
  bad('a/b/c')
  bad('owner/re po')
  bad('owner /repo')
  bad('owner//repo')
  bad('-owner/repo')
  bad('own er/repo')

  // invalid URLs
  bad('https://gitlab.com/facebook/react')
  bad('https://github.com/facebook')
  bad('https://github.com/')
  bad('github.com')
  bad('https://github.com/facebook/')
  bad('https://github.com/%2f/react')
  bad('github.com-facebook/repo')
  bad('facebook$react')

  it('rejects absurdly long input', () => {
    const long = 'a'.repeat(50) + '/b'.repeat(120)
    expect(parseRepoInput(long)).toBeNull()
  })
})
