import type { Metadata } from 'next'
import './globals.css'
import { SupabaseProvider } from '@/components/SupabaseProvider'

export const metadata: Metadata = {
  title: 'Lumina',
  description: 'Universal AI reader — paste any URL or upload any file and start reading smarter.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SupabaseProvider>{children}</SupabaseProvider>
      </body>
    </html>
  )
}
