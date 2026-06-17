import Link from 'next/link'
import type { VehicleResponse } from '@/types'
import VehicleTypeIcon from './VehicleTypeIcon'
import Badge from '@/components/ui/Badge'
import QRDownloadButton from '@/components/qr/QRDownloadButton'
import type { VehicleType } from '@prisma/client'

interface Props {
  vehicle: VehicleResponse
}

export default function VehicleCard({ vehicle }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <VehicleTypeIcon type={vehicle.type as VehicleType} size="md" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-base leading-tight">
              {vehicle.nickname}
            </h3>
            <Badge variant="default" className="mt-1">
              {vehicle.licensePlate}
            </Badge>
          </div>
        </div>

        {/* QR thumbnail — shown when QR is available */}
        {vehicle.qrCodeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vehicle.qrCodeUrl}
            alt={`QR code for ${vehicle.nickname}`}
            className="w-14 h-14 rounded border border-gray-200 flex-shrink-0"
          />
        ) : (
          /* Document count badge when no QR yet */
          <Badge variant="blue" className="flex-shrink-0">
            {vehicle.documentCount}{' '}
            {vehicle.documentCount === 1 ? 'doc' : 'docs'}
          </Badge>
        )}
      </div>

      {/* Doc count when QR is shown */}
      {vehicle.qrCodeUrl && (
        <div className="flex items-center gap-2">
          <Badge variant="blue">
            {vehicle.documentCount}{' '}
            {vehicle.documentCount === 1 ? 'doc' : 'docs'}
          </Badge>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={`/vehicles/${vehicle.id}`}
          className="flex-1 text-center bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Manage
        </Link>

        {vehicle.qrCodeUrl && (
          <QRDownloadButton
            vehicleId={vehicle.id}
            nickname={vehicle.nickname}
            plate={vehicle.licensePlate}
            className="flex-1"
          />
        )}
      </div>
    </div>
  )
}
