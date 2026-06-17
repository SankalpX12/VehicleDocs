import { z } from 'zod'

// ─── Vehicle ──────────────────────────────────────────────────────────────────

export const createVehicleSchema = z.object({
  type: z.enum(['CAR', 'TRUCK', 'BIKE'], {
    errorMap: () => ({ message: 'Vehicle type must be CAR, TRUCK, or BIKE' }),
  }),
  nickname: z
    .string()
    .min(1, 'Nickname is required')
    .max(50, 'Nickname must be 50 characters or less')
    .refine((v) => !/<|>/g.test(v), 'Nickname must not contain HTML tags'),
  licensePlate: z
    .string()
    .min(1, 'License plate is required')
    .max(20, 'License plate must be 20 characters or less')
    .refine((v) => !/<|>/g.test(v), 'License plate must not contain HTML tags'),
})

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>

// ─── Share ────────────────────────────────────────────────────────────────────

export const shareVehicleSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

export type ShareVehicleInput = z.infer<typeof shareVehicleSchema>

// ─── File upload ──────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB in bytes

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
