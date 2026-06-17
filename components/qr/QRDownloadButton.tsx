'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface Props {
  vehicleId: string
  nickname: string
  plate: string
  className?: string
}

/**
 * Triggers the QR code PNG download for a vehicle.
 * Uses the /api/vehicles/[vehicleId]/qr endpoint which enforces owner-only access.
 */
export default function QRDownloadButton({ vehicleId, nickname, plate, className }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/qr`)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not download the QR code. Please try again.')
        return
      }

      // Create a temporary anchor to trigger the browser download dialog
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-${nickname}-${plate}.png`
        .replace(/[^a-zA-Z0-9-_.]/g, '_')
        .replace(/_+/g, '_')
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        loading={downloading}
        onClick={handleDownload}
        className={className}
      >
        {downloading ? 'Downloading…' : 'Download QR'}
      </Button>
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
