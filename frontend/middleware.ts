// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

import { NextRequest, NextResponse } from 'next/server'

// Single-domain Adrian. Single cookie. Single auth path.
//
// /login + /change-password are public (the user is on their way to
// authenticating or completing first-login). Every other route
// requires the adrian_token cookie. On 401 the api wrapper handles
// the redirect; this middleware short-circuits the unauthenticated
// fetch so the user lands on /login rather than a flash of the
// requested page.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('adrian_token')

  if (pathname === '/login' || pathname === '/change-password') {
    if (token && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api).*)'],
}
