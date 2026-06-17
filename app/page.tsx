import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

/**
 * Root route — redirect to dashboard if authenticated, otherwise to login.
 */
export default async function RootPage() {
  const session = await auth()
  redirect(session ? '/dashboard' : '/login')
}
