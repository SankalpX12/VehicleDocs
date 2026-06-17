'use client'

import { useState, useRef } from 'react'
import Button from '@/components/ui/Button'
import type { DocumentResponse } from '@/types'

interface Props {
  vehicleId: string
  onSuccess: (document: DocumentResponse) => void
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx'
const MAX_MB = 20

export default function UploadButton({ vehicleId, onSuccess }: Props) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Client-side pre-check (server enforces the real limits)
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_MB} MB.`)
      return
    }

    setError(null)
    setUploading(true)
    setProgress(10)

    const formData = new FormData()
    formData.append('file', file)

    try {
      // Simulate incremental progress (XHR-based progress is complex with fetch)
      const interval = setInterval(() => {
        setProgress((p) => Math.min(p + 15, 85))
      }, 300)

      const res = await fetch(`/api/vehicles/${vehicleId}/documents`, {
        method: 'POST',
        body: formData,
      })

      clearInterval(interval)
      setProgress(100)

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Upload failed. Please try again.')
        return
      }

      onSuccess(data.document as DocumentResponse)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setUploading(false)
      setProgress(0)
      // Reset input so the same file can be re-selected after an error
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />

      <Button
        type="button"
        size="sm"
        loading={uploading}
        onClick={() => {
          setError(null)
          inputRef.current?.click()
        }}
      >
        {uploading ? 'Uploading…' : '+ Upload Document'}
      </Button>

      {/* Progress bar */}
      {uploading && (
        <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Inline error */}
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
