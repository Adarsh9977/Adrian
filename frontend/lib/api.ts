// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

// Relative path: the browser resolves against the page origin, so the
// dashboard hits the same host's `/api/*` routes. Local dev uses the
// Next.js rewrite in next.config.js to proxy `/api/*` to the backend
// process.
const API_BASE = ''

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Read the session token from the adrian_token cookie. Returns null
// when no cookie is present (logged out, or first paint before login).
function getToken(): string | null {
  if (typeof document === 'undefined') return null
  const cookies = document.cookie.split(';').map(c => c.trim())
  const cookie = cookies.find(c => c.startsWith('adrian_token='))
  return cookie ? cookie.split('=')[1] : null
}

// Client-side fetch wrapper. Sends the bearer token if a cookie is
// readable; otherwise relies on credentials: 'include' to send the
// cookie. 401 response on any authenticated route bounces the user
// to /login (unless we're already on /login or /change-password).
export async function api<T = any>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers,
  })

  if (res.status === 401 && typeof window !== 'undefined') {
    const path = window.location.pathname
    const onAuthPage = path === '/login' || path === '/change-password'
    if (!onAuthPage) {
      window.location.href = '/login'
      return new Promise<T>(() => {}) // never resolves; page is unloading
    }
  }

  // 403 must_change_password: redirect to /change-password unless
  // we're already there. Backend returns this on every authenticated
  // route except /api/auth/change-password and /api/auth/logout.
  if (res.status === 403 && typeof window !== 'undefined') {
    const body = await res.clone().json().catch(() => ({}))
    if (body.error === 'must_change_password') {
      const path = window.location.pathname
      if (path !== '/change-password') {
        window.location.href = '/change-password'
        return new Promise<T>(() => {})
      }
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || res.statusText, res.status)
  }

  // 204 No Content -> return null.
  if (res.status === 204) {
    return null as T
  }
  return res.json()
}

// Server-side fetch (used by Server Components if any). Forwards the
// incoming request's cookie header so the backend sees the same
// session. Most OSS pages are client-rendered; this stays for future
// SSR without churn.
export async function serverApi<T = any>(
  path: string,
  cookie: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Cookie: cookie },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || res.statusText, res.status)
  }

  return res.json()
}
