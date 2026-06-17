import type { VehicleType } from '@prisma/client'

// ─── API Response Shapes ──────────────────────────────────────────────────────
// These are the shapes returned by API routes — Drive file/folder IDs are
// intentionally omitted from all response types.

export interface VehicleResponse {
  id: string
  type: VehicleType
  nickname: string
  licensePlate: string
  qrCodeUrl: string | null
  documentCount: number
  createdAt: string
}

export interface DocumentResponse {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
}

export interface AccessGrantResponse {
  id: string
  grantedTo: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
  createdAt: string
}

export interface AccessLogResponse {
  id: string
  scannedBy: {
    id: string
    name: string | null
    email: string
  }
  scannedAt: string
}

export interface UserResponse {
  id: string
  name: string | null
  email: string
  image: string | null
  createdAt: string
}

export interface LicenseResponse {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
}
