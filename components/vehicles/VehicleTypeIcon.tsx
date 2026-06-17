import type { VehicleType } from '@prisma/client'

interface Props {
  type: VehicleType
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const icons: Record<VehicleType, string> = {
  CAR: '🚗',
  TRUCK: '🚛',
  BIKE: '🏍️',
}

const labels: Record<VehicleType, string> = {
  CAR: 'Car',
  TRUCK: 'Truck',
  BIKE: 'Bike',
}

const sizeClasses = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
}

export default function VehicleTypeIcon({ type, size = 'md', className = '' }: Props) {
  return (
    <span
      role="img"
      aria-label={labels[type]}
      title={labels[type]}
      className={`${sizeClasses[size]} leading-none ${className}`}
    >
      {icons[type]}
    </span>
  )
}
