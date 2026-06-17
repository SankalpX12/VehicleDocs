import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createLicenseFolder, uploadFileToDrive, deleteFileFromDrive } from '@/lib/drive'
import { sanitizeFilename } from '@/lib/utils'
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from '@/lib/validations'
import type { LicenseResponse } from '@/types'
// file-type v16 is CJS — use require()
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fileTypeFromBuffer } = require('file-type') as {
  fileTypeFromBuffer: (buf: Buffer) => Promise<{ mime: string; ext: string } | undefined>
}

// ─── GET /api/license ─────────────────────────────────────────────────────────
// Returns the authenticated user's driving license metadata.
// Only the authenticated user can call this.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const license = await prisma.drivingLicense.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  })

  if (!license) return NextResponse.json({ license: null })

  const response: LicenseResponse = {
    id: license.id,
    fileName: license.fileName,
    mimeType: license.mimeType,
    sizeBytes: license.sizeBytes,
    uploadedAt: license.uploadedAt.toISOString(),
  }

  return NextResponse.json({ license: response })
}

// ─── POST /api/license ────────────────────────────────────────────────────────
// Uploads or replaces the user's driving license.
// Only the authenticated user can call this.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

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

  // Server-side MIME detection
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

  const rawName = (file as File).name ?? 'license'
  const fileName = sanitizeFilename(rawName)

  // Check if a license record already exists
  const existingLicense = await prisma.drivingLicense.findUnique({
    where: { userId },
    select: { id: true, driveFileId: true, driveFolderId: true },
  })

  // If replacing, delete old Drive file first
  if (existingLicense) {
    try {
      await deleteFileFromDrive(userId, existingLicense.driveFileId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json(
        { error: `Could not replace your license. ${msg} Please try again.` },
        { status: 500 },
      )
    }
  }

  // Ensure the license Drive folder exists
  let driveFolderId: string
  if (existingLicense?.driveFolderId) {
    driveFolderId = existingLicense.driveFolderId
  } else {
    try {
      const folderResult = await createLicenseFolder(userId)
      driveFolderId = folderResult.folderId
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown Drive error'
      return NextResponse.json(
        { error: `Failed to create Drive folder. ${msg}` },
        { status: 500 },
      )
    }
  }

  // Upload new file
  let driveResult: { driveFileId: string; fileName: string; mimeType: string; sizeBytes: number }
  try {
    driveResult = await uploadFileToDrive(userId, driveFolderId, fileBuffer, fileName, mimeType)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Drive error'
    return NextResponse.json(
      { error: `Failed to upload to Google Drive. ${msg}` },
      { status: 500 },
    )
  }

  // Upsert the DrivingLicense record (driveFileId and driveFolderId never returned)
  const license = await prisma.drivingLicense.upsert({
    where: { userId },
    create: {
      userId,
      driveFileId: driveResult.driveFileId,
      driveFolderId,
      fileName: driveResult.fileName,
      mimeType: driveResult.mimeType,
      sizeBytes: driveResult.sizeBytes,
    },
    update: {
      driveFileId: driveResult.driveFileId,
      driveFolderId,
      fileName: driveResult.fileName,
      mimeType: driveResult.mimeType,
      sizeBytes: driveResult.sizeBytes,
      updatedAt: new Date(),
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  })

  const response: LicenseResponse = {
    id: license.id,
    fileName: license.fileName,
    mimeType: license.mimeType,
    sizeBytes: license.sizeBytes,
    uploadedAt: license.uploadedAt.toISOString(),
  }

  return NextResponse.json({ license: response }, { status: 201 })
}

// ─── DELETE /api/license ──────────────────────────────────────────────────────
// Deletes the user's driving license from Drive and the database.
// The Drive folder is kept (so re-upload doesn't need a new folder).
export async function DELETE() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const license = await prisma.drivingLicense.findUnique({
    where: { userId },
    select: { id: true, driveFileId: true },
  })

  if (!license) return NextResponse.json({ error: 'No license found' }, { status: 404 })

  try {
    await deleteFileFromDrive(userId, license.driveFileId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Could not delete your license from Google Drive. ${msg}` },
      { status: 500 },
    )
  }

  await prisma.drivingLicense.delete({ where: { userId } })

  return new NextResponse(null, { status: 204 })
}
