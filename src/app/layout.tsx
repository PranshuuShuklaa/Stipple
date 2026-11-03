import type { Metadata } from 'next'
import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google'

const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-display',
  display: 'swap',
})

const fontText = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-text',
  display: 'swap',
})

import { RouteFocus } from '@/components/ui/route-focus'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import GlowBackground from '@/components/ui/glow-background'

import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/motion.css'

/*
 * Runs before paint: applies the manual theme from localStorage.
 * No stored choice means the CSS follows prefers-color-scheme.
 * This and the CSS must stay in sync to avoid a flash on load.
 */
const themeBeforePaint =
  "(function(){try{var t=localStorage.getItem('stipple-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}})()"

function siteBaseUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://stipple.dev')
  } catch {
    return new URL('https://stipple.dev')
  }
}

export const metadata: Metadata = {
  metadataBase: siteBaseUrl(),
  title: 'Stipple — your repo, one dot per file',
  description:
    'Paste a public GitHub repo and see it as a field of dots. One dot is one file.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontText.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBeforePaint }} />
        <noscript>
          <style>{`[data-intro-overlay], [data-intro-status], [data-theme-toggle] { display: none !important; }`}</style>
        </noscript>
      </head>
      <body>
        <GlowBackground />
        <Suspense fallback={null}>
          <RouteFocus />
        </Suspense>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="site-header">
          <div className="shell">
            <Link className="wordmark" href="/">
              <svg className="wordmark-mark" viewBox="0 0 26 26" aria-hidden="true">
                <g className="wordmark-orbit">
                  <circle cx="13" cy="4.5" r="2.6" />
                  <circle cx="21.08" cy="10.37" r="2.6" />
                  <circle cx="18" cy="19.88" r="2.6" />
                  <circle cx="8" cy="19.88" r="2.6" />
                  <circle cx="4.92" cy="10.37" r="2.6" />
                </g>
                <circle className="wordmark-core" cx="13" cy="13" r="2.6" />
              </svg>
              <span className="wordmark-letters" aria-hidden="true">
                {'stipple'.split('').map((letter, index) => (
                  <span className="wordmark-letter" key={`${letter}-${index}`}>
                    {letter}
                  </span>
                ))}
              </span>
              <span className="visually-hidden">stipple</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="t" data-q style={{ position: 'relative', zIndex: 2, padding: '60px 24px' }}>
          Design prototype for approval. Demo data is generated from the repo name.
        </footer>
      </body>
    </html>
  )
}
