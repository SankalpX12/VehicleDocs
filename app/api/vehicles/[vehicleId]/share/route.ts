import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { shareVehicleSchema } from '@/lib/validations'

type Params = { params: Promise<{ vehicleId: string }> }

// ─── GET /api/vehicles/[vehicleId]/share ─────────────────────────────────────
// Owner-only: list current access grants
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId } = await params
  const userId = session.user.id

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      ownerId: true,
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
    },
  })

  if (!vehicle || vehicle.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    grants: vehicle.accessGrants.map((grant) => ({
      id: grant.id,
      createdAt: grant.createdAt.toISOString(),
      grantedTo: grant.grantedTo,
    })),
  })
}

// ─── POST /api/vehicles/[vehicleId]/share ────────────────────────────────────
// Owner-only: grant access by email
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId } = await params
  const userId = session.user.id

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = shareVehicleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const email = parsed.data.email.trim()

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { ownerId: true },
  })

  if (!vehicle || vehicle.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userToGrant = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, name: true, email: true, image: true },
  })

  if (!userToGrant) {
    return NextResponse.json(
      { error: 'No account found for that email. The user must sign up first.' },
      { status: 404 },
    )
  }

  if (userToGrant.id === userId) {
    return NextResponse.json(
      { error: 'You already have access as the owner.' },
      { status: 400 },
    )
  }

  const existing = await prisma.accessGrant.findUnique({
    where: { vehicleId_grantedToId: { vehicleId, grantedToId: userToGrant.id } },
    select: { id: true },
  })

  if (existing) {
    return NextResponse.json(
      { error: 'Access already granted to this user.' },
      { status: 409 },
    )
  }

  const grant = await prisma.accessGrant.create({
    data: {
      vehicleId,
      grantedToId: userToGrant.id,
      grantedById: userId,
    },
    select: {
      id: true,
      createdAt: true,
      grantedTo: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  })

  return NextResponse.json(
    {
      grant: {
        id: grant.id,
        createdAt: grant.createdAt.toISOString(),
        grantedTo: grant.grantedTo,
      },
    },
    { status: 201 },
  )
}