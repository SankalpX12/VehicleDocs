import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteFileFromDrive } from '@/lib/drive'
import { NextResponse } from 'next/server'

interface Params {
  params: { vehicleId: string }
}

// ─── GET /api/vehicles/[vehicleId] ────────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: params.vehicleId },
    select: {
      id: true,
      type: true,
      nickname: true,
      licensePlate: true,
      qrCodeUrl: true,
      ownerId: true,
      createdAt: true,
      // driveFolderId intentionally omitted from select
      documents: {
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
          // driveFileId intentionally omitted
        },
      },
      accessGrants: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          grantedTo: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
      accessLogs: {
        orderBy: { scannedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          scannedAt: true,
          scannedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  })

  if (!vehicle) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  // Owner-only: return 403 for anyone else (never 404 — avoids info leakage)
  if (vehicle.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    vehicle: {
      id: vehicle.id,
      type: vehicle.type,
      nickname: vehicle.nickname,
      licensePlate: vehicle.licensePlate,
      qrCodeUrl: vehicle.qrCodeUrl,
      createdAt: vehicle.createdAt.toISOString(),
      documents: vehicle.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
      accessGrants: vehicle.accessGrants.map((g) => ({
        id: g.id,
        createdAt: g.createdAt.toISOString(),
        grantedTo: g.grantedTo,
      })),
      accessLogs: vehicle.accessLogs.map((l) => ({
        id: l.id,
        scannedAt: l.scannedAt.toISOString(),
        scannedBy: l.scannedBy,
      })),
    },
  })
}

// ─── DELETE /api/vehicles/[vehicleId] ─────────────────────────────────────────

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: params.vehicleId },
    select: {
      ownerId: true,
      driveFolderId: true,
      documents: { select: { driveFileId: true } },
    },
  })

  if (!vehicle) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  if (vehicle.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete all Drive files first, then the folder
  // Errors are logged but don't block the DB deletion
  for (const doc of vehicle.documents) {
    try {
      await deleteFileFromDrive(session.user.id, doc.driveFileId)
    } catch (err) {
      console.error(`[DELETE vehicle] Failed to delete Drive file ${doc.driveFileId}:`, err)
    }
  }

  try {
    await deleteFileFromDrive(session.user.id, vehicle.driveFolderId)
  } catch (err) {
    console.error(`[DELETE vehicle] Failed to delete Drive folder ${vehicle.driveFolderId}:`, err)
  }

  // Prisma cascade deletes documents, access grants, and logs automatically
  await prisma.vehicle.delete({ where: { id: params.vehicleId } })

  return new NextResponse(null, { status: 204 })
}
