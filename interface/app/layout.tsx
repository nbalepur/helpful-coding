import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from './utils/auth'
import { SnackbarProvider } from './components/SnackbarProvider'
import UserStudyPopupProvider from './components/UserStudyPopupProvider'
import { IframeThemeProvider } from './utils/IframeThemeContext'
import AppLayout from './components/AppLayout'
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
            <IframeThemeProvider>
              <Suspense fallback={null}>
                <UserStudyPopupProvider>
                  <AppLayout>
                    {children}
                  </AppLayout>
                </UserStudyPopupProvider>
              </Suspense>
            </IframeThemeProvider>
          </SnackbarProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
