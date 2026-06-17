'use client'

import { useState } from 'react'
import type { DocumentResponse } from '@/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import UploadButton from './UploadButton'
import { formatFileSize } from '@/lib/utils'

interface Props {
  vehicleId: string
  initialDocuments: DocumentResponse[]
}

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

function mimeVariant(mime: string): 'default' | 'blue' | 'green' | 'red' | 'yellow' {
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

export default function DocumentList({ vehicleId, initialDocuments }: Props) {
  const [documents, setDocuments] = useState<DocumentResponse[]>(initialDocuments)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDocumentAdded = (doc: DocumentResponse) => {
    setDocuments((prev) => [doc, ...prev])
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return

    setDeletingId(docId)
    setDeleteError(null)

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/documents/${docId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(data.error ?? 'Failed to delete. Please try again.')
        return
      }

      setDocuments((prev) => prev.filter((d) => d.id !== docId))
    } catch {
      setDeleteError('Network error. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {/* Upload button */}
      <div className="mb-4">
        <UploadButton vehicleId={vehicleId} onSuccess={handleDocumentAdded} />
      </div>

      {deleteError && (
        <div
          className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"
          role="alert"
        >
          {deleteError}
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-400 text-sm">No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
            >
              {/* File type badge */}
              <Badge variant={mimeVariant(doc.mimeType)} className="flex-shrink-0 text-xs w-12 justify-center">
                {mimeLabel[doc.mimeType] ?? 'FILE'}
              </Badge>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium text-gray-800 truncate"
                  title={doc.fileName}
                >
                  {doc.fileName}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatFileSize(doc.sizeBytes)} · {formatDate(doc.uploadedAt)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={`/api/vehicles/${vehicleId}/documents/${doc.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  View
                </a>
                <a
                  href={`/api/vehicles/${vehicleId}/documents/${doc.id}/download`}
                  className="text-xs text-gray-600 hover:text-gray-800 font-medium"
                >
                  Download
                </a>
                <Button
                  variant="danger"
                  size="sm"
                  loading={deletingId === doc.id}
                  onClick={() => handleDelete(doc.id)}
                  className="text-xs px-2 py-1"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
