'use client'

import { useId, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { parseRepoInput } from '@/lib/repo-input'
import styles from './scan-form.module.css'

const EMPTY_MESSAGE = 'Type a repo first, like facebook/react.'
const INVALID_MESSAGE = "That doesn't look like a GitHub repo. Use owner/repo, or paste the repo's URL."

export function RepoForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const messageId = useId()
  const [message, setMessage] = useState('')
  const [invalid, setInvalid] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const raw = inputRef.current?.value ?? ''
    const parsed = parseRepoInput(raw)

    if (!parsed) {
      const isBlank = raw.trim().length === 0
      setMessage(isBlank ? EMPTY_MESSAGE : INVALID_MESSAGE)
      setInvalid(true)
      inputRef.current?.focus()
      return
    }

    setInvalid(false)
    setMessage('')
    router.push(`/scan/${parsed.owner}/${parsed.repo}`)
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.fieldRow}>
        <label htmlFor="repo-input" className={styles.prefix}>
          <span aria-hidden="true">github.com/</span>
          <span className="visually-hidden">GitHub repository, owner and repo</span>
        </label>
        <input
          id="repo-input"
          name="repo"
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder="owner/repo"
          aria-invalid={invalid}
          aria-required="true"
          aria-describedby={messageId}
          aria-errormessage={invalid ? messageId : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <button type="submit" className={styles.button}>
          Scan repo
        </button>
      </div>
      <p id={messageId} className={styles.message} role="status" aria-live="polite">
        {message}
      </p>
    </form>
  )
}
