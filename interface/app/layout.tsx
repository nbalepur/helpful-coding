import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from './utils/auth'
import { SnackbarProvider } from './components/SnackbarProvider'
import UserStudyPopupProvider from './components/UserStudyPopupProvider'
import { Suspense } from 'react'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Vibe Jam',
  description: 'Vibe Jam'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <SnackbarProvider>
            <Suspense fallback={null}>
              <UserStudyPopupProvider>
                {children}
              </UserStudyPopupProvider>
            </Suspense>
          </SnackbarProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
