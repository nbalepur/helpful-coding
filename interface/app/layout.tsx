import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './styles/globals.css'
import { AuthProvider } from './context/auth'
import { SnackbarProvider } from './components/ui/SnackbarProvider'
import { IframeThemeProvider } from './context/IframeThemeContext'
import AppLayout from './components/layout/AppLayout'
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
                <AppLayout>
                  {children}
                </AppLayout>
              </Suspense>
            </IframeThemeProvider>
          </SnackbarProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
