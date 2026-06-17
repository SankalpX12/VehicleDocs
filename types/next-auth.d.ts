import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  /**
   * Extends the built-in session.user type to include the database `id` field.
   * This is populated in the `session` callback in lib/auth.ts.
   */
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
  }
}
