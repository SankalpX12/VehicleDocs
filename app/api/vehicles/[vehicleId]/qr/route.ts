import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateVehicleQR } from '@/lib/qr'
import { put } from '@vercel/blob'

type Params = { params: Promise<{ vehicleId: string }> }

// ─── GET /api/vehicles/[vehicleId]/qr ─────────────────────────────────────────
// Owner-only: streams the QR PNG as a file download.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId } = await params
  const userId = session.user.id

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { ownerId: true, qrCodeUrl: true, nickname: true, licensePlate: true },
  })

  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  // QR download is owner-only (403 rather than 404 to avoid leaking existence)
  if (vehicle.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!vehicle.qrCodeUrl) {
    return NextResponse.json(
      { error: 'QR code has not been generated for this vehicle yet.' },
      { status: 404 },
    )
  }

  // Fetch the PNG from Vercel Blob and pipe it as a download
  let blobRes: Response
  try {
    blobRes = await fetch(vehicle.qrCodeUrl)
    if (!blobRes.ok) throw new Error(`Blob fetch returned ${blobRes.status}`)
  } catch (err) {
    console.error('[GET /api/vehicles/qr] Blob fetch failed:', err)
    return NextResponse.json(
      { error: 'Could not retrieve the QR code. Please try again.' },
      { status: 502 },
    )
  }

  // Sanitise the filename so it's safe in Content-Disposition
  const safeName = `qr-${vehicle.nickname}-${vehicle.licensePlate}`
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100)

  return new NextResponse(blobRes.body, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${safeName}.png"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ─── POST /api/vehicles/[vehicleId]/qr ───────────────────────────────────────
// Owner-only: generate or regenerate QR and persist qrCodeUrl.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId } = await params
  const userId = session.user.id

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, ownerId: true },
  })

  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  if (vehicle.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'localhost:3000'
    const qrBuffer = await generateVehicleQR(vehicle.id, appDomain)

    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) {
      console.error('[POST /api/vehicles/[vehicleId]/qr] Missing BLOB_READ_WRITE_TOKEN')
      return NextResponse.json(
        { error: 'QR code service is not configured. Please contact support.' },
        { status: 500 },
      )
    }

    const blob = await put(`qr/${vehicle.id}.png`, qrBuffer, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
      allowOverwrite: true,
      token,
    })

    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { qrCodeUrl: blob.url },
      select: { qrCodeUrl: true },
    })

    return NextResponse.json({ qrCodeUrl: updated.qrCodeUrl }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/vehicles/[vehicleId]/qr] generation failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate QR code. Please try again.' },
      { status: 500 },
    )
  }
}
