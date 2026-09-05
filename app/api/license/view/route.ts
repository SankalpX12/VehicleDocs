import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { streamFileFromDrive } from '@/lib/drive'
import { Readable } from 'node:stream'

// ─── GET /api/license/view ────────────────────────────────────────────────────
// Streams the driving license for in-browser viewing.
// ONLY the authenticated user themselves can call this.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const license = await prisma.drivingLicense.findUnique({
    where: { userId },
    select: { driveFileId: true, fileName: true, mimeType: true },
  })

  if (!license) return NextResponse.json({ error: 'No license found' }, { status: 404 })

  let nodeStream: Readable
  try {
    nodeStream = await streamFileFromDrive(userId, license.driveFileId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('404') || msg.includes('not found')) {
      await prisma.drivingLicense.delete({ where: { userId } }).catch(() => {})
      return NextResponse.json(
        {
          error:
            'Your license file is no longer available. It may have been deleted from Google Drive.',
        },
        { status: 410 },
      )
    }
    return NextResponse.json(
      { error: 'Failed to retrieve your license from Google Drive.' },
      { status: 500 },
    )
  }

  const chunks: Buffer[] = []
  for await (const chunk of nodeStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const fileBuffer = Buffer.concat(chunks)

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': license.mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(license.fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}
