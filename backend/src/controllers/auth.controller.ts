import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as clientService from '../services/client.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/response';
import { currentUserId } from '../middleware/tenant';
import { actorFrom } from '../utils/actorContext';
import type { LoginInput, RegisterInput } from '../services/auth.service';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerAgencyAdmin(req.body as RegisterInput);
  return sendCreated(res, result);
});

/**
 * Login.
 *
 * `expectedPortal` is optional and only used to give a clearer error when a
 * user signs in through the wrong portal; the stored role is always the
 * authority for what the account may do.
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, expectedPortal } = req.body as LoginInput;
  const result = await authService.login({ email, password, expectedPortal });
  return sendSuccess(res, result);
});

/**
 * Logout.
 *
 * Tokens are stateless, so the client is instructed to discard them. The
 * endpoint still exists so the frontend has a single, auditable sign-out path.
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, { message: 'Signed out successfully' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const user = await authService.getAuthenticatedUser(userId);
  return sendSuccess(res, user);
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateProfile(currentUserId(req), req.body);
  return sendSuccess(res, user);
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  await authService.changePassword(currentUserId(req), currentPassword, newPassword);
  return sendSuccess(res, { message: 'Password updated' });
});

/** The signed-in user's own client company, if they are a client account. */
export const myClient = asyncHandler(async (req: Request, res: Response) => {
  const clientId = req.user?.clientId;
  if (!clientId) throw AppError.notFound('This account is not linked to a client company');
  const client = await clientService.getClientById(actorFrom(req), clientId);
  return sendSuccess(res, client);
});