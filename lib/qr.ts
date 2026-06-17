import QRCode from 'qrcode'

/**
 * Generates a QR code PNG buffer for a vehicle.
 *
 * The QR encodes: https://{appDomain}/v/{vehicleId}
 * No sensitive data is embedded — only the public scan URL.
 *
 * Error correction level H (30% damage tolerance) is used so the
 * code remains scannable when printed as a sticker.
 */
export async function generateVehicleQR(
  vehicleId: string,
  appDomain: string,
): Promise<Buffer> {
  // Normalise domain — strip trailing slash and any leading protocol so we
  // always produce a clean https:// URL regardless of what's in the env var.
  const domain = appDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const url = `https://${domain}/v/${vehicleId}`

  const buffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  })

  return buffer as Buffer
}
