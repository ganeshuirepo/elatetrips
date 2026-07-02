import { Router } from 'express';
import type { AuthController } from './auth.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  requestOtpSchema,
  verifyOtpSchema,
  resendOtpSchema,
  signupSchema,
  verifyAccountSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation';

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Signup, account verification, password login, OTP login, and password reset.
 */
export function buildAuthRouter(controller: AuthController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/auth/signup:
   *   post:
   *     tags: [Auth]
   *     summary: Register a new account (sends a verification OTP)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, email, phone, gender, age, password]
   *             properties:
   *               name: { type: string, example: "Asha Rao" }
   *               email: { type: string, example: "asha@example.com" }
   *               phone: { type: string, example: "9876543210" }
   *               gender: { type: string, enum: [male, female, other, prefer_not_to_say] }
   *               age: { type: integer, example: 29 }
   *               password: { type: string, example: "secret123" }
   *               verifyVia: { type: string, enum: [email, mobile], default: mobile }
   *     responses:
   *       201: { description: "Account created (pending); OTP sent to chosen channel" }
   *       409: { description: Mobile/email already registered }
   */
  router.post('/signup', validate({ body: signupSchema }), asyncHandler(controller.signup));

  /**
   * @openapi
   * /api/v1/auth/verify-account:
   *   post:
   *     tags: [Auth]
   *     summary: Verify email/mobile to activate a signup (returns JWT)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [identifier, otp]
   *             properties:
   *               identifier: { type: string, description: "Email or phone the OTP was sent to" }
   *               otp: { type: string, example: "123456" }
   *     responses:
   *       200: { description: "{ token, user }" }
   *       401: { description: Invalid or expired OTP }
   */
  router.post(
    '/verify-account',
    validate({ body: verifyAccountSchema }),
    asyncHandler(controller.verifyAccount),
  );

  /**
   * @openapi
   * /api/v1/auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Password login with email or mobile number
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [identifier, password]
   *             properties:
   *               identifier: { type: string, example: "asha@example.com" }
   *               password: { type: string, example: "secret123" }
   *     responses:
   *       200: { description: "{ token, user }" }
   *       401: { description: Invalid credentials }
   *       403: { description: Account not verified }
   */
  router.post('/login', validate({ body: loginSchema }), asyncHandler(controller.login));

  /**
   * @openapi
   * /api/v1/auth/forgot-password:
   *   post:
   *     tags: [Auth]
   *     summary: Request a password-reset OTP
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [identifier]
   *             properties:
   *               identifier: { type: string, example: "9876543210" }
   *     responses:
   *       200: { description: "OTP sent if the account exists" }
   */
  router.post(
    '/forgot-password',
    validate({ body: forgotPasswordSchema }),
    asyncHandler(controller.forgotPassword),
  );

  /**
   * @openapi
   * /api/v1/auth/reset-password:
   *   post:
   *     tags: [Auth]
   *     summary: Reset the password using the OTP (returns JWT)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [identifier, otp, password]
   *             properties:
   *               identifier: { type: string }
   *               otp: { type: string }
   *               password: { type: string }
   *     responses:
   *       200: { description: "{ token, user }" }
   *       401: { description: Invalid or expired OTP }
   */
  router.post(
    '/reset-password',
    validate({ body: resetPasswordSchema }),
    asyncHandler(controller.resetPassword),
  );

  /**
   * @openapi
   * /api/v1/auth/request-otp:
   *   post:
   *     tags: [Auth]
   *     summary: "OTP login: send a login OTP to a registered email or mobile"
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [identifier]
   *             properties:
   *               identifier: { type: string, example: "9876543210" }
   *     responses:
   *       200: { description: OTP sent }
   *       404: { description: No account for this identifier }
   */
  router.post('/request-otp', validate({ body: requestOtpSchema }), asyncHandler(controller.requestOtp));

  /**
   * @openapi
   * /api/v1/auth/verify-otp:
   *   post:
   *     tags: [Auth]
   *     summary: "OTP login: verify the 6-digit OTP and receive a JWT"
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [identifier, otp]
   *             properties:
   *               identifier: { type: string, example: "9876543210" }
   *               otp: { type: string, example: "123456" }
   *     responses:
   *       200: { description: "{ token, user }" }
   *       401: { description: Invalid or expired OTP }
   */
  router.post('/verify-otp', validate({ body: verifyOtpSchema }), asyncHandler(controller.verifyOtp));

  /**
   * @openapi
   * /api/v1/auth/resend-otp:
   *   post:
   *     tags: [Auth]
   *     summary: Re-send an OTP to a registered email or mobile
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [identifier]
   *             properties:
   *               identifier: { type: string }
   *     responses:
   *       200: { description: "OTP re-sent if the account exists" }
   *       429: { description: Requested again too soon }
   */
  router.post('/resend-otp', validate({ body: resendOtpSchema }), asyncHandler(controller.resendOtp));

  return router;
}
