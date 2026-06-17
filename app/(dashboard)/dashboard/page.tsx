import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import VehicleList from '@/components/vehicles/VehicleList'
import LicenseSection from '@/components/license/LicenseSection'
import type { VehicleResponse } from '@/types'
import type { VehicleType } from '@prisma/client'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await auth()
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there'

  // Fetch all vehicles owned by the authenticated user
  const dbVehicles = await prisma.vehicle.findMany({
    where: { ownerId: session!.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      nickname: true,
      licensePlate: true,
      qrCodeUrl: true,
      createdAt: true,
      _count: { select: { documents: true } },
    },
  })

  const vehicles: VehicleResponse[] = dbVehicles.map((v) => ({
    id: v.id,
    type: v.type as VehicleType,
    nickname: v.nickname,
    licensePlate: v.licensePlate,
    qrCodeUrl: v.qrCodeUrl,
    documentCount: v._count.documents,
    createdAt: v.createdAt.toISOString(),
  }))

  return (
    <div>
      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back, {firstName}!</p>
      </div>

      {/* ── My Driving License ─────────────────────────────────────── */}
      <LicenseSection />

      {/* ── Vehicles ───────────────────────────────────────────────── */}
      <VehicleList initialVehicles={vehicles} />
    </div>
  )
}
