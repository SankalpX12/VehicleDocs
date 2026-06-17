import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadFileToDrive } from '@/lib/drive'
import { canAccessVehicle, isVehicleOwner, sanitizeFilename } from '@/lib/utils'
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from '@/lib/validations'
import type { DocumentResponse } from '@/types'
// file-type v16 is CJS — use require()
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fileTypeFromBuffer } = require('file-type') as {
  fileTypeFromBuffer: (buf: Buffer) => Promise<{ mime: string; ext: string } | undefined>
}

type Params = { params: Promise<{ vehicleId: string }> }

// ─── GET /api/vehicles/[vehicleId]/documents ──────────────────────────────────
// Accessible by: vehicle owner + users with access_grants
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId } = await params
  const userId = session.user.id

  const canAccess = await canAccessVehicle(userId, vehicleId)
  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const documents = await prisma.document.findMany({
    where: { vehicleId },
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  })

  const response: DocumentResponse[] = documents.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    uploadedAt: d.uploadedAt.toISOString(),
  }))

  return NextResponse.json({ documents: response })
}

// ─── POST /api/vehicles/[vehicleId]/documents ─────────────────────────────────
// Owner only — upload a document to the vehicle's Drive folder
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId } = await params
  const userId = session.user.id

  const ownerCheck = await isVehicleOwner(userId, vehicleId)
  if (!ownerCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Size check
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File is too large. Maximum size is 20 MB.' },
      { status: 400 },
    )
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty.' }, { status: 400 })
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer())

  // Server-side MIME type detection from raw bytes
  const detected = await fileTypeFromBuffer(fileBuffer)
  const mimeType = detected?.mime ?? file.type

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      {
        error:
          'File type not supported. Please upload a PDF, image (JPG/PNG), or Office document (DOCX/XLSX).',
      },
      { status: 400 },
    )
  }

  // Sanitize file name
  const rawName = (file as File).name ?? 'document'
  const fileName = sanitizeFilename(rawName)

  // Fetch vehicle with driveFolderId (owner only at this point)
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { driveFolderId: true, ownerId: true },
  })

  if (!vehicle) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  // Upload to Drive
  let driveResult: { driveFileId: string; fileName: string; mimeType: string; sizeBytes: number }
  try {
    driveResult = await uploadFileToDrive(
      vehicle.ownerId,
      vehicle.driveFolderId,
      fileBuffer,
      fileName,
      mimeType,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Drive error'
    return NextResponse.json(
      { error: `Failed to upload to Google Drive. ${msg}` },
      { status: 500 },
    )
  }

  // Save to DB (driveFileId is stored but never returned to client)
  const document = await prisma.document.create({
    data: {
      vehicleId,
      driveFileId: driveResult.driveFileId,
      fileName: driveResult.fileName,
      mimeType: driveResult.mimeType,
      sizeBytes: driveResult.sizeBytes,
      uploadedById: userId,
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  })

  const response: DocumentResponse = {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt.toISOString(),
  }

  return NextResponse.json({ document: response }, { status: 201 })
}
