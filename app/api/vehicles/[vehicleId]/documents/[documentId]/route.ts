import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteFileFromDrive } from '@/lib/drive'
import { isVehicleOwner } from '@/lib/utils'

type Params = { params: Promise<{ vehicleId: string; documentId: string }> }

// ─── DELETE /api/vehicles/[vehicleId]/documents/[documentId] ──────────────────
// Owner only
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId, documentId } = await params
  const userId = session.user.id

  const ownerCheck = await isVehicleOwner(userId, vehicleId)
  if (!ownerCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { driveFileId: true, vehicleId: true },
  })

  if (!document || document.vehicleId !== vehicleId) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Delete from Drive first — if it fails, we do NOT delete the DB record
  try {
    await deleteFileFromDrive(userId, document.driveFileId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Drive error'
    return NextResponse.json(
      { error: `Could not delete the file from Google Drive. ${msg}` },
      { status: 500 },
    )
  }

  await prisma.document.delete({ where: { id: documentId } })

  return new NextResponse(null, { status: 204 })
}
