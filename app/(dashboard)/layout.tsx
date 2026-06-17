import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Navbar ───────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-gray-900 text-lg hover:text-indigo-600 transition-colors"
          >
            <span className="text-xl" role="img" aria-label="car">🚗</span>
            VehicleDocs
          </Link>

          {/* User section */}
          <div className="flex items-center gap-3">
            {session.user?.image && (
              <Image
                src={session.user.image}
                alt={session.user.name ?? 'User avatar'}
                width={34}
                height={34}
                className="rounded-full ring-2 ring-indigo-100"
              />
            )}
            <span className="text-sm text-gray-700 hidden sm:block font-medium">
              {session.user?.name}
            </span>

            {/* Sign-out — server action in a form */}
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <button
                type="submit"
                className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  )
}
