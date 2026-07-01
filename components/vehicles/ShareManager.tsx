'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import type { AccessGrantResponse } from '@/types'

interface Props {
  vehicleId: string
  initialGrants: AccessGrantResponse[]
}

export default function ShareManager({ vehicleId, initialGrants }: Props) {
  const [email, setEmail] = useState('')
  const [grants, setGrants] = useState<AccessGrantResponse[]>(initialGrants)
  const [loading, setLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleShare(e: React.FormEvent) {
    e.preventDefault()
    const normalizedEmail = email.trim()
    if (!normalizedEmail) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const validationMessage = data.details?.email?.[0]
        setError(validationMessage ?? data.error ?? 'Failed to share vehicle. Please try again.')
        return
      }

      setGrants((prev) => [data.grant as AccessGrantResponse, ...prev])
      setEmail('')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRevoke(grantId: string) {
    const confirmed = confirm('Revoke access for this user?')
    if (!confirmed) return

    setRevokingId(grantId)
    setError(null)

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/share/${grantId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to revoke access. Please try again.')
        return
      }

      setGrants((prev) => prev.filter((grant) => grant.id !== grantId))
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Share Access</h2>

      <form onSubmit={handleShare} className="flex flex-col gap-3 mb-5">
        <Input
          id="share-email"
          label="Grant access to email"
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div>
          <Button type="submit" size="sm" loading={loading}>
            Grant Access
          </Button>
        </div>
      </form>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {grants.length === 0 ? (
        <p className="text-sm text-gray-500">No users have access yet.</p>
      ) : (
        <div className="space-y-3">
          {grants.map((grant) => (
            <div
              key={grant.id}
              className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {grant.grantedTo.name ?? 'Unnamed User'}
                </p>
                <p className="text-xs text-gray-500 truncate">{grant.grantedTo.email}</p>
              </div>

              <Button
                variant="danger"
                size="sm"
                loading={revokingId === grant.id}
                onClick={() => void handleRevoke(grant.id)}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}