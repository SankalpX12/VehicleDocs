import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessVehicle } from '@/lib/utils'
import { redirect } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import DocumentViewer from '@/components/vehicles/DocumentViewer'
import VehicleTypeIcon from '@/components/vehicles/VehicleTypeIcon'
import type { VehicleType } from '@prisma/client'

interface Props {
  params: Promise<{ vehicleId: string }>
}

export default async function VehicleScanPage({ params }: Props) {
  const { vehicleId } = await params
  const session = await auth()

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/v/${vehicleId}`)}`)
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      type: true,
      nickname: true,
      licensePlate: true,
      qrCodeUrl: true,
      ownerId: true,
      owner: { select: { name: true } },
    },
  })

  if (!vehicle) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-white px-4 py-10 flex items-center justify-center">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-lg border border-gray-100 p-8 text-center">
          <div className="text-5xl mb-4">🔎</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Vehicle Not Found</h1>
          <p className="text-sm text-gray-500">
            This vehicle could not be found. The QR code may be outdated.
          </p>
        </div>
      </main>
    )
  }

  const hasAccess = await canAccessVehicle(session.user.id, vehicleId)

  if (!hasAccess) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-red-50 to-white px-4 py-10 flex items-center justify-center">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-lg border border-red-100 p-8 text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-sm text-gray-500 mb-2">
            You don&apos;t have permission to view this vehicle&apos;s documents.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            If you believe this is a mistake, ask the vehicle owner to share access with your Google account email: {session.user.email}
          </p>
          <a
            href="/dashboard"
            className="inline-block bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Go to your Dashboard
          </a>
        </div>
      </main>
    )
  }

  await prisma.accessLog.create({
    data: {
      vehicleId,
      scannedById: session.user.id,
    },
  })

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <header className="flex flex-col items-center gap-3 mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-md">
            <span className="text-4xl" role="img" aria-label="car">🚗</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">VehicleDocs</h1>
        </header>

        <section className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 mb-6 text-center">
          <div className="flex justify-center mb-4">
            <VehicleTypeIcon type={vehicle.type as VehicleType} size="lg" />
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-3">{vehicle.nickname}</h2>

          <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
            <Badge variant="default">{vehicle.licensePlate}</Badge>
            <Badge variant="blue">{vehicle.type}</Badge>
          </div>

          {vehicle.qrCodeUrl && (
            <div className="flex justify-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vehicle.qrCodeUrl}
                alt={`QR code for ${vehicle.nickname}`}
                className="w-32 h-32 rounded-xl border border-gray-200"
              />
            </div>
          )}

          <p className="text-sm text-gray-500">
            Documents owned by {vehicle.owner.name ?? 'Unknown Owner'}
          </p>
        </section>

        <DocumentViewer vehicleId={vehicle.id} />

        <footer className="text-center text-xs text-gray-400 mt-8">
          Powered by VehicleDocs
        </footer>
      </div>
    </main>
  )
}