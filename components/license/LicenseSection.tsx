'use client'

import { useState, useEffect, useRef } from 'react'
import type { LicenseResponse } from '@/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { formatFileSize } from '@/lib/utils'

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx'
const MAX_MB = 20

const mimeLabel: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'image/png': 'PNG',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
}

function mimeVariant(mime: string): 'default' | 'blue' | 'red' {
  if (mime === 'application/pdf') return 'red'
  if (mime.startsWith('image/')) return 'blue'
  return 'default'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function LicenseSection() {
  const [license, setLicense] = useState<LicenseResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch license on mount
  useEffect(() => {
    fetch('/api/license')
      .then((r) => r.json())
      .then((data) => setLicense(data.license ?? null))
      .catch(() => setError('Failed to load license info.'))
      .finally(() => setLoading(false))
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_MB} MB.`)
      return
    }

    setError(null)
    setUploading(true)
    setUploadProgress(10)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const interval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 15, 85))
      }, 300)

      const res = await fetch('/api/license', {
        method: 'POST',
        body: formData,
      })

      clearInterval(interval)
      setUploadProgress(100)

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Upload failed. Please try again.')
        return
      }

      setLicense(data.license as LicenseResponse)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete your driving license? This cannot be undone.')) return

    setDeleting(true)
    setError(null)

    try {
      const res = await fetch('/api/license', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to delete. Please try again.')
        return
      }
      setLicense(null)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const triggerUpload = () => {
    setError(null)
    inputRef.current?.click()
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">My Driving License</h2>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
            Loading…
          </div>
        ) : license ? (
          /* ── License exists ──────────────────────────────────── */
          <div>
            <div className="flex items-center gap-3">
              <Badge variant={mimeVariant(license.mimeType)} className="flex-shrink-0 text-xs">
                {mimeLabel[license.mimeType] ?? 'FILE'}
              </Badge>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium text-gray-800 truncate"
                  title={license.fileName}
                >
                  {license.fileName}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatFileSize(license.sizeBytes)} · {formatDate(license.uploadedAt)}
                </p>
              </div>
            </div>

            {/* Actions row */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <a
                href="/api/license/view"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                View
              </a>
              <a
                href="/api/license/download"
                className="text-sm bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Download
              </a>
              <Button
                variant="secondary"
                size="sm"
                loading={uploading}
                onClick={triggerUpload}
              >
                Replace
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={handleDelete}
              >
                Delete
              </Button>
            </div>

            {/* Upload progress */}
            {uploading && (
              <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          /* ── No license uploaded ─────────────────────────────── */
          <div className="text-center py-4">
            <div className="text-3xl mb-2" role="img" aria-label="id card">🪪</div>
            <p className="text-gray-600 text-sm font-medium mb-1">
              You haven&apos;t uploaded your driving license yet.
            </p>
            <p className="text-gray-400 text-xs mb-4">
              Your license is completely private — only you can view it.
            </p>
            <Button size="sm" loading={uploading} onClick={triggerUpload}>
              + Upload License
            </Button>

            {uploading && (
              <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-xs mx-auto">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"
            role="alert"
          >
            {error}
          </div>
        )}
      </div>
    </section>
  )
}
