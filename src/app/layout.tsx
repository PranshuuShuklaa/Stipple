import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Familjen_Grotesk } from 'next/font/google'

import { ThemeToggle } from '@/components/ui/theme-toggle'

import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/motion.css'

const fontSans = Familjen_Grotesk({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-sans',
})

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
    <html lang="en" className={fontSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBeforePaint }} />
      </head>
      <body>
        <header className="site-header">
          <div className="shell">
            <Link className="wordmark" href="/">
              stipple
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
