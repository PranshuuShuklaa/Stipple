'use client'

/* The share previews must use the API's raw SVG responses as plain images. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HeroVisual } from '@/components/ui/hero-visual'
import { RepoForm } from '@/features/scan-form/repo-form'
import { NameIntro } from '@/features/intro/name-intro'
import styles from './home.module.css'

const INTRO_STYLE: 'name' | 'dots' = 'name'
const REAL_REPOS = [
  ['expressjs', 'express'],
  ['facebook', 'react'],
  ['vitejs', 'vite'],
] as const

export default function HomePage() {
  const [outputsVisible, setOutputsVisible] = useState(true)
  const router = useRouter()

  const handleIntroDone = useCallback(() => undefined, [])

  const handleOutputError = useCallback(() => {
    setOutputsVisible(false)
  }, [])

  return (
    <>
      {INTRO_STYLE === 'name' && <NameIntro onDone={handleIntroDone} />}

      <div className="home">
        <section className={styles.hero}>
          <HeroVisual />
          <div className="shell">
            <h1
              className={`${styles.headline} type-display t`}
              data-q
              aria-label="Your repo, one dot per file."
            >
              <span className={styles.headlineMask} aria-hidden="true">
                <span className="headline-letter">Your repo,</span>
              </span>
              <span className={styles.headlineMask} aria-hidden="true">
                <span className="headline-letter">one dot per file.</span>
              </span>
            </h1>
            <p className={`${styles.sentence} t`} data-q>
              Paste a public GitHub repo, then scroll through its story: files,
              languages, activity and folders.
            </p>
            <RepoForm />
          </div>
        </section>

        <section className={`${styles.realRepo} shell`} aria-labelledby="real-repo-heading">
          <div className={styles.sectionIntro}>
            <h2 id="real-repo-heading" className="type-section t" data-q>
              Try it on a real repo
            </h2>
            <p className="t" data-q>
              Start with a public project and watch its actual files become a living field.
            </p>
          </div>
          <div className={styles.repoButtons}>
            {REAL_REPOS.map(([owner, repo]) => (
              <button
                key={`${owner}/${repo}`}
                type="button"
                className={styles.repoButton}
                onClick={() => router.push(`/scan/${owner}/${repo}`)}
              >
                {owner}/{repo}
              </button>
            ))}
          </div>
        </section>

        <section className={`${styles.outputs} shell`} aria-labelledby="outputs-heading">
          <div className={styles.sectionIntro}>
            <h2 id="outputs-heading" className="type-section t" data-q>
              What you get
            </h2>
            <ol className={styles.steps}>
              <li>Paste a public repo.</li>
              <li>Watch every file become a dot.</li>
              <li>Copy the badge or card into your README.</li>
            </ol>
          </div>
          {outputsVisible && (
            <figure className={styles.outputPreview}>
              <div className={styles.previewImages}>
                <img
                  src="/api/card/expressjs/express"
                  alt="Animated Stipple card for expressjs/express"
                  width={600}
                  height={240}
                  loading="lazy"
                  onError={handleOutputError}
                />
                <img
                  src="/api/badge/expressjs/express"
                  alt="Stipple badge for expressjs/express"
                  width={100}
                  height={20}
                  loading="lazy"
                  onError={handleOutputError}
                />
              </div>
              <figcaption className="t">
                Real output for expressjs/express. Yours looks like this.
              </figcaption>
            </figure>
          )}
        </section>
      </div>
    </>
  )
}
