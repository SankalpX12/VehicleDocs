import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { streamFileFromDrive } from '@/lib/drive'
import { canAccessVehicle } from '@/lib/utils'
import type { Readable } from 'stream'
import { ReadableStream as WebReadableStream } from 'stream/web'

type Params = { params: Promise<{ vehicleId: string; documentId: string }> }

// ─── GET /api/vehicles/[vehicleId]/documents/[documentId]/view ────────────────
// Streams the document for in-browser viewing.
// Accessible by: vehicle owner + users with access_grants
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId, documentId } = await params
  const userId = session.user.id

  const canAccess = await canAccessVehicle(userId, vehicleId)
  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch document + vehicle owner (we use owner's credentials for Drive)
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      driveFileId: true,
      fileName: true,
      mimeType: true,
      vehicleId: true,
      vehicle: { select: { ownerId: true } },
    },
  })

  if (!document || document.vehicleId !== vehicleId) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  let nodeStream: Readable
  try {
    nodeStream = await streamFileFromDrive(document.vehicle.ownerId, document.driveFileId)
  } catch (err) {
    // If Drive says the file is gone, clean up the stale DB record
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('404') || msg.includes('not found')) {
      await prisma.document.delete({ where: { id: documentId } }).catch(() => {})
      return NextResponse.json(
        {
          error:
            'This document is no longer available. The owner may have deleted it from Google Drive.',
        },
        { status: 410 },
      )
    }
    return NextResponse.json(
      { error: 'Failed to retrieve the document from Google Drive.' },
      { status: 500 },
    )
  }

  // Convert Node.js Readable → WHATWG ReadableStream for Next.js Response
  const webStream = nodeStream as unknown as ReadableStream
  return new NextResponse(webStream as WebReadableStream, {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(document.fileName)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
