'use client'

import { useEffect, useState } from 'react'
import type { DocumentResponse } from '@/types'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'

interface Props {
  vehicleId: string
}

export default function DocumentViewer({ vehicleId }: Props) {
  const [documents, setDocuments] = useState<DocumentResponse[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDocuments() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/vehicles/${vehicleId}/documents`, {
          cache: 'no-store',
        })

        const data = await res.json()

        if (!res.ok) {
          if (!cancelled) {
            setError(data.error ?? 'Failed to load documents.')
          }
          return
        }

        if (!cancelled) {
          setDocuments(data.documents ?? [])
        }
      } catch {
        if (!cancelled) {
          setError('Network error. Please try again.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadDocuments()

    return () => {
      cancelled = true
    }
  }, [vehicleId])

  const handleViewDocument = () => {
    if (!selectedDocumentId) return

    window.open(
      `/api/vehicles/${vehicleId}/documents/${selectedDocumentId}/view`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-500">Loading documents...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-500">
          No documents have been uploaded for this vehicle yet.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4">
      <Select
        id="document"
        label="Vehicle Documents"
        value={selectedDocumentId}
        onChange={(e) => setSelectedDocumentId(e.target.value)}
        placeholder="Select a document"
        options={documents.map((document) => ({
          value: document.id,
          label: `${document.fileName} (${document.mimeType})`,
        }))}
      />

      <Button onClick={handleViewDocument} disabled={!selectedDocumentId}>
        View Document
      </Button>
    </div>
  )
}