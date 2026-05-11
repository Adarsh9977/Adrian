// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

// Curated MAD-alert lookup. The dashboard fetches the bundle from
// /api/mad-alerts once per session and resolves each verdict's
// mad_code into a pre-written description, example, and references.
//
// The model's raw chain-of-thought is never shown to users; surfacing
// it would risk leaking prompt-injection material verbatim.

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export type AlertReference = {
  framework: string
  identifier: string
  url: string
}

export type MadAlert = {
  code: string
  severity: 'M2' | 'M3' | 'M4'
  severity_label: string
  subcategory: string
  description: string
  example: string
  default_action: 'NOTIFY' | 'BLOCK' | 'ESCALATE'
  references: AlertReference[]
}

export type MadAlertBundle = {
  default_action: Record<string, string>
  alerts: Record<string, MadAlert>
}

let cache: MadAlertBundle | null = null
let inflight: Promise<MadAlertBundle | null> | null = null

async function load(): Promise<MadAlertBundle | null> {
  if (cache) return cache
  if (!inflight) {
    inflight = api<{ data: MadAlertBundle }>('/api/mad-alerts')
      .then(r => {
        cache = r.data
        return cache
      })
      .catch(() => null)
  }
  return inflight
}

// useMadAlerts is the React hook every page consumes. Returns null
// until the first fetch resolves; subsequent renders read from cache.
export function useMadAlerts(): MadAlertBundle | null {
  const [bundle, setBundle] = useState<MadAlertBundle | null>(cache)
  useEffect(() => {
    if (bundle) return
    let cancelled = false
    load().then(b => { if (!cancelled) setBundle(b) })
    return () => { cancelled = true }
  }, [bundle])
  return bundle
}

// resolveAlert returns the curated entry for a verdict's mad_code.
// Empty / M0 codes return null. A bare base code (e.g. "M3") returns
// null too; callers fall back to bundle.default_action[base] for the
// default action.
export function resolveAlert(bundle: MadAlertBundle | null, madCode: string): MadAlert | null {
  if (!bundle) return null
  if (!madCode || madCode.startsWith('M0')) return null
  return bundle.alerts[madCode] || null
}
