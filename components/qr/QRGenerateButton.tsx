'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface Props {
  vehicleId: string
  className?: string
}

export default function QRGenerateButton({ vehicleId, className }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/qr`, {
        method: 'POST',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? 'Failed to generate QR. Please try again.')
        return
      }

      window.location.reload()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={loading}
        onClick={() => void handleGenerate()}
        className="w-full"
      >
        {loading ? 'Generating...' : 'Generate QR'}
      </Button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}