import { notFound } from 'next/navigation'
import { createScanFixture } from '../../../../tests/fixtures/scan-fixture'
import { DevEngineClient } from './client'

export const metadata = {
  title: 'Dot Engine Dev Stage — Stipple',
  robots: {
    index: false,
    follow: false,
  },
}

export default function DevEnginePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  const fixture = createScanFixture('stipple/stipple')

  return (
    <div className="shell" style={{ paddingBlock: '32px' }}>
      <DevEngineClient scan={fixture} />
    </div>
  )
}
