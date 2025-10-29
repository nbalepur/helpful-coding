import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Get cookies
  const userId = request.cookies.get('user_id')?.value
  const authToken = request.cookies.get('auth_token')?.value
  
  const isAuthenticated = !!(userId && authToken)
  
  // If not authenticated and trying to access protected routes
  if (!isAuthenticated && pathname !== '/landing') {
    return NextResponse.redirect(new URL('/landing', request.url))
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
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
