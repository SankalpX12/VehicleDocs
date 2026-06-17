import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { Readable } from 'stream'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encryption'

// ─── OAuth client ─────────────────────────────────────────────────────────────

/**
 * Builds a configured Google OAuth2 client using the stored (encrypted)
 * tokens for the given user. Does NOT refresh — call refreshAndSaveToken()
 * when a Drive API call returns 401.
 */
export async function getOAuthClient(userId: string): Promise<OAuth2Client> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleAccessToken: true, googleRefreshToken: true },
  })

  if (!user) throw new Error(`User not found: ${userId}`)

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
  )

  oauth2Client.setCredentials({
    access_token: user.googleAccessToken
      ? decrypt(user.googleAccessToken)
      : undefined,
    refresh_token: user.googleRefreshToken
      ? decrypt(user.googleRefreshToken)
      : undefined,
  })

  return oauth2Client
}

/**
 * Refreshes the access token using the stored refresh token and saves
 * the new encrypted access token (and optional new refresh token) to the DB.
 */
export async function refreshAndSaveToken(
  userId: string,
  oauth2Client: OAuth2Client,
): Promise<OAuth2Client> {
  const { credentials } = await oauth2Client.refreshAccessToken()

  const updateData: { googleAccessToken?: string; googleRefreshToken?: string } = {}

  if (credentials.access_token) {
    updateData.googleAccessToken = encrypt(credentials.access_token)
  }
  if (credentials.refresh_token) {
    updateData.googleRefreshToken = encrypt(credentials.refresh_token)
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: updateData })
  }

  oauth2Client.setCredentials(credentials)
  return oauth2Client
}

/**
 * Returns a Drive service client, automatically retrying once with a
 * refreshed token if the first attempt returns a 401.
 */
async function getDriveClient(userId: string) {
  const oauth2Client = await getOAuthClient(userId)
  return { drive: google.drive({ version: 'v3', auth: oauth2Client }), oauth2Client }
}

// ─── Error handling helper ────────────────────────────────────────────────────

function isDriveAuthError(err: unknown): boolean {
  const status = (err as { status?: number; code?: number })?.status ??
    (err as { status?: number; code?: number })?.code
  return status === 401 || status === 403
}

// ─── Folder creation ──────────────────────────────────────────────────────────

/**
 * Creates a private Drive folder for a vehicle.
 * No sharing permissions are set — the folder is only accessible via
 * the owner's OAuth credentials through the app server.
 */
export async function createVehicleFolder(
  userId: string,
  vehicleNickname: string,
  licensePlate: string,
): Promise<{ folderId: string }> {
  let { drive, oauth2Client } = await getDriveClient(userId)

  const folderName = `VehicleDocs — ${vehicleNickname} (${licensePlate})`

  try {
    const folder = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    })

    const folderId = folder.data.id
    if (!folderId) throw new Error('Drive did not return a folder ID')
    return { folderId }
  } catch (err) {
    if (isDriveAuthError(err)) {
      // Token expired — refresh and retry once
      oauth2Client = await refreshAndSaveToken(userId, oauth2Client)
      const retryDrive = google.drive({ version: 'v3', auth: oauth2Client })

      const folder = await retryDrive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      })

      const folderId = folder.data.id
      if (!folderId) throw new Error('Drive did not return a folder ID')
      return { folderId }
    }
    throw err
  }
}

/**
 * Creates a private Drive folder for the user's driving license.
 * Called once on first license upload if the folder doesn't already exist.
 */
export async function createLicenseFolder(
  userId: string,
): Promise<{ folderId: string }> {
  let { drive, oauth2Client } = await getDriveClient(userId)

  try {
    const folder = await drive.files.create({
      requestBody: {
        name: 'VehicleDocs — My Driving License',
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    })

    const folderId = folder.data.id
    if (!folderId) throw new Error('Drive did not return a folder ID')
    return { folderId }
  } catch (err) {
    if (isDriveAuthError(err)) {
      oauth2Client = await refreshAndSaveToken(userId, oauth2Client)
      const retryDrive = google.drive({ version: 'v3', auth: oauth2Client })

      const folder = await retryDrive.files.create({
        requestBody: {
          name: 'VehicleDocs — My Driving License',
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      })

      const folderId = folder.data.id
      if (!folderId) throw new Error('Drive did not return a folder ID')
      return { folderId }
    }
    throw err
  }
}

// ─── File operations ──────────────────────────────────────────────────────────

/**
 * Uploads a file buffer to the specified Drive folder.
 * Returns metadata — the driveFileId is for server-side use only.
 */
export async function uploadFileToDrive(
  ownerUserId: string,
  folderId: string,
  file: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{
  driveFileId: string
  fileName: string
  mimeType: string
  sizeBytes: number
}> {
  const { Readable } = await import('stream')
  let { drive, oauth2Client } = await getDriveClient(ownerUserId)

  const doUpload = async (driveClient: typeof drive) => {
    const uploaded = await driveClient.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType, body: Readable.from(file) },
      fields: 'id, name, mimeType, size',
    })

    const data = uploaded.data
    if (!data.id) throw new Error('Drive did not return a file ID')

    return {
      driveFileId: data.id,
      fileName: data.name ?? fileName,
      mimeType: data.mimeType ?? mimeType,
      sizeBytes: Number(data.size ?? file.byteLength),
    }
  }

  try {
    return await doUpload(drive)
  } catch (err) {
    if (isDriveAuthError(err)) {
      oauth2Client = await refreshAndSaveToken(ownerUserId, oauth2Client)
      return await doUpload(google.drive({ version: 'v3', auth: oauth2Client }))
    }
    throw err
  }
}

/**
 * Streams a file from Drive without exposing the Drive URL.
 * The returned Readable should be piped directly into the HTTP response.
 */
export async function streamFileFromDrive(
  ownerUserId: string,
  driveFileId: string,
): Promise<Readable> {
  let { drive, oauth2Client } = await getDriveClient(ownerUserId)

  const doStream = async (driveClient: typeof drive): Promise<Readable> => {
    const response = await driveClient.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'stream' },
    )
    return response.data as unknown as Readable
  }

  try {
    return await doStream(drive)
  } catch (err) {
    if (isDriveAuthError(err)) {
      oauth2Client = await refreshAndSaveToken(ownerUserId, oauth2Client)
      return await doStream(google.drive({ version: 'v3', auth: oauth2Client }))
    }
    throw err
  }
}

/**
 * Deletes a file or folder from Drive by its ID.
 */
export async function deleteFileFromDrive(
  ownerUserId: string,
  driveFileId: string,
): Promise<{ success: boolean }> {
  let { drive, oauth2Client } = await getDriveClient(ownerUserId)

  const doDelete = async (driveClient: typeof drive) => {
    await driveClient.files.delete({ fileId: driveFileId })
    return { success: true }
  }

  try {
    return await doDelete(drive)
  } catch (err) {
    if (isDriveAuthError(err)) {
      oauth2Client = await refreshAndSaveToken(ownerUserId, oauth2Client)
      return await doDelete(google.drive({ version: 'v3', auth: oauth2Client }))
    }
    throw err
  }
}
