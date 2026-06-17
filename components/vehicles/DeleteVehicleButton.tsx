'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'

interface Props {
  vehicleId: string
}

export default function DeleteVehicleButton({ vehicleId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    const confirmed = confirm(
      'Delete this vehicle and all related Drive files? This cannot be undone.',
    )

    if (!confirmed) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to delete vehicle. Please try again.')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Button variant="danger" loading={loading} onClick={() => void handleDelete()}>
        Delete Vehicle
      </Button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}