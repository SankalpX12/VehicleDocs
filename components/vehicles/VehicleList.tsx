'use client'

import { useState } from 'react'
import type { VehicleResponse } from '@/types'
import VehicleCard from '@/components/vehicles/VehicleCard'
import AddVehicleForm from '@/components/vehicles/AddVehicleForm'
import Button from '@/components/ui/Button'

interface Props {
  initialVehicles: VehicleResponse[]
}

export default function VehicleList({ initialVehicles }: Props) {
  const [vehicles, setVehicles] = useState<VehicleResponse[]>(initialVehicles)
  const [showForm, setShowForm] = useState(false)

  const handleVehicleAdded = (newVehicle: VehicleResponse) => {
    setVehicles((prev) => [newVehicle, ...prev])
    setShowForm(false)
  }

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">My Vehicles</h2>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} size="sm">
            + Add Vehicle
          </Button>
        )}
      </div>

      {/* Add vehicle form */}
      {showForm && (
        <div className="mb-6">
          <AddVehicleForm
            onSuccess={handleVehicleAdded}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Vehicle grid */}
      {vehicles.length === 0 && !showForm ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-14 text-center">
          <div className="text-5xl mb-3" role="img" aria-label="car">🚗</div>
          <h3 className="text-gray-700 font-semibold text-lg">No vehicles yet</h3>
          <p className="text-gray-400 text-sm mt-1 mb-4">
            Register your first vehicle to get started.
          </p>
          <Button onClick={() => setShowForm(true)}>+ Add Your First Vehicle</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      )}
    </section>
  )
}
