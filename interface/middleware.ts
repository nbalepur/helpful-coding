import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ENV } from './app/config/env'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Skip middleware for static files (images, fonts, etc.)
  const staticFileExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.eot']
  if (staticFileExtensions.some(ext => pathname.toLowerCase().endsWith(ext))) {
    return NextResponse.next()
  }
  
  // Get cookies (namespaced with prefix)
  const prefix = ENV.COOKIE_PREFIX
  const userId = request.cookies.get(`${prefix}user_id`)?.value
  const authToken = request.cookies.get(`${prefix}auth_token`)?.value
  
  let isAuthenticated = false

  if (userId && authToken) {
    try {
      const response = await fetch(`${ENV.BACKEND_URL}/auth/validate`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        cache: 'no-store',
      })

      if (response.ok) {
        const data = await response.json()
        isAuthenticated = Boolean(data?.valid)
      }
    } catch (error) {
      console.error('Error validating auth token in middleware:', error)
      isAuthenticated = false
    }
  }
  
  // If not authenticated and trying to access protected routes
  if (!isAuthenticated && pathname !== '/landing') {
    const redirectResponse = NextResponse.redirect(new URL('/landing', request.url))
    redirectResponse.cookies.delete(`${prefix}user_id`)
    redirectResponse.cookies.delete(`${prefix}auth_token`)
    return redirectResponse
  }
  
  // If authenticated and on landing page, redirect to browse
  if (isAuthenticated && pathname === '/landing') {
    return NextResponse.redirect(new URL('/browse', request.url))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Note: Static files in public directory are handled in the middleware function
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
