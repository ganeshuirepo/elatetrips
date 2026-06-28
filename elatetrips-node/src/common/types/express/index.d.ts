/**
 * Augments Express's Request with the authenticated principal set by the auth
 * guard. Keeping it here means controllers get a typed `req.user` for free.
 */
declare global {
  namespace Express {
    interface AuthenticatedUser {
      phone: string;
    }
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
