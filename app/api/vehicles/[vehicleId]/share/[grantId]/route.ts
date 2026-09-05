import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ vehicleId: string; grantId: string }> }

// ─── DELETE /api/vehicles/[vehicleId]/share/[grantId] ───────────────────────
// Owner-only: revoke an existing grant
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId, grantId } = await params
  const userId = session.user.id

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { ownerId: true },
  })

  if (!vehicle || vehicle.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const grant = await prisma.accessGrant.findUnique({
    where: { id: grantId },
    select: { id: true, vehicleId: true },
  })

  if (!grant || grant.vehicleId !== vehicleId) {
    return NextResponse.json({ error: 'Grant not found' }, { status: 404 })
  }

  await prisma.accessGrant.delete({ where: { id: grantId } })
  return new NextResponse(null, { status: 204 })
}