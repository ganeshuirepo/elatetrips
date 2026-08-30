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
      /**
       * The exact bytes of the request body, captured by the json parser's
       * `verify` hook for webhook routes only. Signature schemes sign the raw
       * payload, and re-serialising the parsed object will not reproduce it —
       * key order and whitespace both change — so the buffer has to be kept.
       */
      rawBody?: Buffer;
    }
  }
}

export {};
