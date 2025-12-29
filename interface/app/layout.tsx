import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from './utils/auth'
import { SnackbarProvider } from './components/SnackbarProvider'
import UserStudyPopupProvider from './components/UserStudyPopupProvider'

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
            <UserStudyPopupProvider>
            {children}
            </UserStudyPopupProvider>
          </SnackbarProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
