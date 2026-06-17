'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { VehicleResponse } from '@/types'

interface Props {
  onSuccess: (vehicle: VehicleResponse) => void
  onCancel: () => void
}

const vehicleTypeOptions = [
  { value: 'CAR', label: '🚗 Car' },
  { value: 'TRUCK', label: '🚛 Truck' },
  { value: 'BIKE', label: '🏍️ Bike' },
]

export default function AddVehicleForm({ onSuccess, onCancel }: Props) {
  const [type, setType] = useState('')
  const [nickname, setNickname] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)

    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, nickname, licensePlate }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.details) {
          setFieldErrors(data.details)
        } else {
          setError(data.error ?? 'Something went wrong. Please try again.')
        }
        return
      }

      onSuccess(data.vehicle)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-indigo-200 p-5 flex flex-col gap-4"
    >
      <h3 className="font-semibold text-gray-900">Register a New Vehicle</h3>

      <Select
        id="vehicle-type"
        label="Vehicle Type"
        placeholder="Select a type…"
        options={vehicleTypeOptions}
        value={type}
        onChange={(e) => setType(e.target.value)}
        error={fieldErrors.type?.[0]}
        required
      />

      <Input
        id="nickname"
        label="Nickname"
        placeholder="e.g. My White Toyota"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        error={fieldErrors.nickname?.[0]}
        maxLength={50}
        required
      />

      <Input
        id="license-plate"
        label="License Plate"
        placeholder="e.g. MH12AB1234"
        value={licensePlate}
        onChange={(e) => setLicensePlate(e.target.value)}
        error={fieldErrors.licensePlate?.[0]}
        maxLength={20}
        required
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-xs text-gray-500 text-center">
          Creating your private Drive folder… this may take a few seconds.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" loading={loading} className="flex-1">
          Register Vehicle
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
