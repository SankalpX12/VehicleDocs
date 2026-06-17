import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DocumentList from '@/components/vehicles/DocumentList'
import Badge from '@/components/ui/Badge'
import VehicleTypeIcon from '@/components/vehicles/VehicleTypeIcon'
import QRDownloadButton from '@/components/qr/QRDownloadButton'
import type { VehicleType } from '@prisma/client'
import type { DocumentResponse } from '@/types'

type Props = { params: Promise<{ vehicleId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vehicleId } = await params
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { nickname: true },
  })
  return { title: vehicle ? `Manage — ${vehicle.nickname}` : 'Manage Vehicle' }
}

export default async function VehicleManagePage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { vehicleId } = await params
  const userId = session.user.id

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      type: true,
      nickname: true,
      licensePlate: true,
      qrCodeUrl: true,
      ownerId: true,
      createdAt: true,
      documents: {
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
        },
      },
    },
  })

  if (!vehicle) notFound()

  // Only the owner can access this page
  if (vehicle.ownerId !== userId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center">
          <div className="text-4xl mb-3">🚫</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 text-sm">
            You don&apos;t have permission to manage this vehicle.
          </p>
          <a
            href="/dashboard"
            className="mt-4 inline-block bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    )
  }

  const initialDocuments: DocumentResponse[] = vehicle.documents.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    uploadedAt: d.uploadedAt.toISOString(),
  }))

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── Vehicle header ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <VehicleTypeIcon type={vehicle.type as VehicleType} size="lg" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{vehicle.nickname}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="default">{vehicle.licensePlate}</Badge>
              <Badge variant="blue">{vehicle.type}</Badge>
            </div>
          </div>
        </div>

        {/* QR code section */}
        {vehicle.qrCodeUrl && (
          <div className="mt-5 pt-5 border-t border-gray-100 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vehicle.qrCodeUrl}
              alt="Vehicle QR code"
              className="w-20 h-20 rounded border border-gray-200"
            />
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Share this QR code so others can view the documents for this vehicle.
              </p>
              <QRDownloadButton
                vehicleId={vehicle.id}
                nickname={vehicle.nickname}
                plate={vehicle.licensePlate}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Documents section ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Documents</h2>
        <DocumentList vehicleId={vehicle.id} initialDocuments={initialDocuments} />
      </div>

      {/* ── Sharing — Phase 6 placeholder ─────────────────────────── */}
      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6 mb-6 text-center">
        <p className="text-gray-400 text-sm">
          Access sharing and scan logs — coming in Phase 6.
        </p>
      </div>

      {/* ── Delete vehicle ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-red-100 p-6">
        <h2 className="text-base font-semibold text-red-700 mb-1">Danger Zone</h2>
        <p className="text-sm text-gray-500 mb-3">
          Deleting this vehicle will permanently remove all its documents from Google Drive
          and cannot be undone.
        </p>
        {/* DeleteVehicleButton is a Phase 6 client component */}
        <button
          disabled
          className="bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg opacity-50 cursor-not-allowed"
        >
          Delete Vehicle
        </button>
      </div>
    </div>
  )
}
