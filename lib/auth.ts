export const runtime = 'nodejs'
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Request Drive access in addition to standard profile scopes.
          // drive.file allows creating/reading only files the app creates.
          scope:
            'openid email profile https://www.googleapis.com/auth/drive.file',
          // access_type=offline gives us a refresh_token
          access_type: 'offline',
          // prompt=consent forces a new consent screen on every sign-in,
          // which guarantees a fresh refresh_token is returned.
          prompt: 'consent',
        },
      },
    }),
  ],

  session: {
    strategy: 'jwt',
  },

  callbacks: {
    /**
     * jwt runs on every token creation/refresh.
     * `account` is only populated on the initial sign-in — we use it to
     * persist encrypted Drive credentials to the User record.
     */
    async jwt({ token, user, account }) {
      // On first sign-in: user is the newly-created DB user (from adapter)
      if (user?.id) {
        token.id = user.id
      }

      // On initial Google sign-in: persist encrypted OAuth tokens
      if (account?.provider === 'google' && token.id) {
        const updateData: {
          googleId: string
          googleAccessToken?: string
          googleRefreshToken?: string
        } = {
          googleId: account.providerAccountId,
        }

        if (account.access_token) {
          updateData.googleAccessToken = encrypt(account.access_token)
        }
        if (account.refresh_token) {
          updateData.googleRefreshToken = encrypt(account.refresh_token)
        }

        try {
          await prisma.user.update({
            where: { id: token.id as string },
            data: updateData,
          })
        } catch (err) {
          console.error('[auth] Failed to store Google tokens:', err)
        }
      }

      return token
    },

    /**
     * Attach the database user ID to the session so it's available
     * via `session.user.id` in all server components and API routes.
     */
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
  },
})
