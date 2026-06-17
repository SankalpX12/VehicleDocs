import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createVehicleSchema } from '@/lib/validations'
import { createVehicleFolder } from '@/lib/drive'
import { generateVehicleQR } from '@/lib/qr'
import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'

// ─── GET /api/vehicles ────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      nickname: true,
      licensePlate: true,
      qrCodeUrl: true,
      createdAt: true,
      // driveFolderId intentionally omitted
      _count: { select: { documents: true } },
    },
  })

  return NextResponse.json({
    vehicles: vehicles.map((v) => ({
      id: v.id,
      type: v.type,
      nickname: v.nickname,
      licensePlate: v.licensePlate,
      qrCodeUrl: v.qrCodeUrl,
      documentCount: v._count.documents,
      createdAt: v.createdAt.toISOString(),
    })),
  })
}

// ─── POST /api/vehicles ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Validate input
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createVehicleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { type, nickname, licensePlate } = parsed.data
  const userId = session.user.id

  // 2. Create private Drive folder — before writing to DB so we can fail cleanly
  let folderId: string
  try {
    const result = await createVehicleFolder(userId, nickname, licensePlate)
    folderId = result.folderId
  } catch (err) {
    console.error('[POST /api/vehicles] Drive folder creation failed:', err)
    const message = getDriveErrorMessage(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // 3. Create the Vehicle record in the database
  let vehicle: { id: string; type: string; nickname: string; licensePlate: string; qrCodeUrl: string | null; createdAt: Date }
  try {
    vehicle = await prisma.vehicle.create({
      data: {
        ownerId: userId,
        type,
        nickname,
        licensePlate,
        driveFolderId: folderId,
      },
      select: {
        id: true,
        type: true,
        nickname: true,
        licensePlate: true,
        qrCodeUrl: true,
        createdAt: true,
        // driveFolderId intentionally omitted
      },
    })
  } catch (err) {
    console.error('[POST /api/vehicles] DB insert failed:', err)
    // Drive folder was already created — log but don't fail silently
    // The folder will remain in Drive but is orphaned; acceptable for MVP
    return NextResponse.json(
      { error: 'Failed to save vehicle. Please try again.' },
      { status: 500 },
    )
  }

  // 4. Generate QR code and upload to Vercel Blob
  let qrCodeUrl: string | null = null
  try {
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'localhost:3000'
    const qrBuffer = await generateVehicleQR(vehicle.id, appDomain)
    const blob = await put(`qr/${vehicle.id}.png`, qrBuffer, {
      access: 'public',
      contentType: 'image/png',
    })
    qrCodeUrl = blob.url

    // Persist the QR URL on the vehicle record
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { qrCodeUrl },
    })
  } catch (err) {
    // QR generation failure is non-fatal — the vehicle is already created.
    // The owner can still manage documents; the QR will just show as unavailable.
    console.error('[POST /api/vehicles] QR generation/upload failed:', err)
  }

  return NextResponse.json(
    {
      vehicle: {
        id: vehicle.id,
        type: vehicle.type,
        nickname: vehicle.nickname,
        licensePlate: vehicle.licensePlate,
        qrCodeUrl,
        documentCount: 0,
        createdAt: vehicle.createdAt.toISOString(),
      },
    },
    { status: 201 },
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDriveErrorMessage(err: unknown): string {
  const status = (err as { status?: number; code?: number })?.status ??
    (err as { status?: number; code?: number })?.code

  if (status === 401) {
    return 'Your Google Drive connection has expired. Please sign out and sign back in.'
  }
  if (status === 403) {
    return 'Please reconnect your Google account and allow Drive access when prompted.'
  }
  return 'Failed to create your Drive folder. Please try again.'
}
