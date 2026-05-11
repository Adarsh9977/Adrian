'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Badge } from '@/components/badge'
import { Pagination } from '@/components/pagination'
import { madBadgeColor, timeAgo } from '@/lib/utils'

export default function AgentsPage() {
  const [data, setData] = useState<{ agents: any[]; total: number }>({ agents: [], total: 0 })
  const [page, setPage] = useState(1)

  useEffect(() => {
    api(`/api/agents?page=${page}&per_page=20`)
      .then(r => setData(r.data || { agents: [], total: 0 }))
      .catch(() => {})
  }, [page])

  const isEmpty = !data.agents.length

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink mb-6">Agents</h2>

      {isEmpty ? (
        <EmptyState
          title="No agents yet"
          hint="Agents register the first time your SDK initialises with an API key. Run an instrumented agent and it'll appear here."
        />
      ) : (
        <>
          <div className="bg-surface-raised border border-surface-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 border-b border-surface-border bg-surface-overlay/50">
                  <th className="px-4 py-2.5 text-[13px] font-medium">Agent ID</th>
                  <th className="px-4 py-2.5 text-[13px] font-medium">Last seen</th>
                  <th className="px-4 py-2.5 text-[13px] font-medium">Events</th>
                  <th className="px-4 py-2.5 text-[13px] font-medium">Worst MAD</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a: any) => (
                  <tr key={a.id} className="border-b border-surface-border/50 table-row-hover">
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-2">
                      <Link href={`/agents/${a.agent_id}`} className="hover:underline">{a.agent_id}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink-3 text-xs">{timeAgo(a.last_seen)}</td>
                    <td className="px-4 py-2.5 text-ink">{a.event_count}</td>
                    <td className="px-4 py-2.5">
                      {a.worst_mad && <Badge label={a.worst_mad} className={madBadgeColor(a.worst_mad)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} perPage={20} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  )
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="bg-surface-raised border border-surface-border rounded-lg p-8 text-center">
      <p className="text-sm text-ink mb-1">{title}</p>
      <p className="text-xs text-ink-3 max-w-md mx-auto">{hint}</p>
    </div>
  )
}
