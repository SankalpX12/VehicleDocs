import { prisma } from '@/lib/prisma'

/**
 * Returns true if the given user is the vehicle owner OR has an
 * explicit access_grants record for the vehicle.
 * Returns false if the vehicle doesn't exist.
 */
export async function canAccessVehicle(
  userId: string,
  vehicleId: string,
): Promise<boolean> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      ownerId: true,
      accessGrants: { select: { grantedToId: true } },
    },
  })

  if (!vehicle) return false
  if (vehicle.ownerId === userId) return true

  return vehicle.accessGrants.some((grant) => grant.grantedToId === userId)
}

/**
 * Returns true if the given user is the vehicle owner.
 * Returns false for shared users or if the vehicle doesn't exist.
 */
export async function isVehicleOwner(
  userId: string,
  vehicleId: string,
): Promise<boolean> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { ownerId: true },
  })
  return vehicle?.ownerId === userId
}

/**
 * Formats a file size in bytes to a human-readable string (e.g. "1.4 MB").
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Sanitizes a string for use in a filename — strips characters that are
 * invalid in filenames across Windows, macOS, and Linux.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim()
}
