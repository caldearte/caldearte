import type { DefaultSession } from "next-auth";

// Module augmentation adding the custom `isAdmin` claim computed in
// lib/auth.ts's callbacks — standard Auth.js v5 pattern for extending the
// built-in Session/JWT shapes.
declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { isAdmin: boolean };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isAdmin?: boolean;
  }
}
