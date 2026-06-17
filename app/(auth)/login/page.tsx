import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SignInButton from '@/components/auth/SignInButton'

export const metadata: Metadata = { title: 'Sign In' }

interface Props {
  searchParams: { callbackUrl?: string }
}

export default async function LoginPage({ searchParams }: Props) {
  const session = await auth()

  // Already authenticated — go to callbackUrl or dashboard
  if (session) {
    redirect(searchParams.callbackUrl ?? '/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-md">
            <span className="text-3xl" role="img" aria-label="car">🚗</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            VehicleDocs
          </h1>
        </div>

        <p className="text-center text-gray-500 text-sm leading-relaxed">
          Manage your vehicle documents, anywhere.
        </p>

        <hr className="w-full border-gray-100" />

        <SignInButton callbackUrl={searchParams.callbackUrl} />

        <p className="text-xs text-gray-400 text-center leading-relaxed">
          By continuing, you allow VehicleDocs to create private folders in
          your Google Drive to store vehicle documents.
        </p>
      </div>
    </main>
  )
}
