import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Real login foundation for a future full accounts system (docs/
// roadmap.md's Phase 2.1: Google OAuth via Auth.js, JWT sessions, no
// separate sessions table). For now the ONLY consumer is the admin gate
// behind /login — there's no `users` table yet since nothing else needs
// one; adding it speculatively would be exactly the kind of infra this
// project has consistently avoided building ahead of a real consumer.
// `isAdminSession` is a single, narrow, swappable seam: once real roles
// exist, only this function's body changes to a DB lookup — every call
// site (the API route, the client hook) stays identical.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })],
  session: { strategy: "jwt" },
  callbacks: {
    // Computed server-side from an env var, never shipped to the client
    // as a raw comparison — the browser only ever sees the resulting
    // boolean via the session.
    async jwt({ token }) {
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      token.isAdmin = Boolean(adminEmail) && typeof token.email === "string" && token.email.toLowerCase() === adminEmail;
      return token;
    },
    async session({ session, token }) {
      session.user.isAdmin = token.isAdmin === true;
      return session;
    },
  },
});

export function isAdminSession(session: { user?: { isAdmin?: boolean } } | null): boolean {
  return session?.user?.isAdmin === true;
}
