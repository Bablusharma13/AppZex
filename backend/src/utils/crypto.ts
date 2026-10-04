import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './AppError';
import type { JwtAccessPayload, JwtRefreshPayload } from '../types';
import type { Role } from '../types/enums';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Compares a candidate password against the stored hash without leaking which
 * half failed. Used to keep login timing roughly constant for unknown emails.
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function burnPasswordComparison(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}

export interface TokenSignInput {
  userId: string;
  email: string;
  role: Role;
  agencyId?: string;
  clientId?: string;
}

export function signAccessToken(input: TokenSignInput): { token: string; jti: string; expiresIn: number } {
  const jti = crypto.randomUUID();
  const payload = {
    sub: input.userId,
    email: input.email,
    role: input.role,
    ...(input.agencyId ? { agencyId: input.agencyId } : {}),
    ...(input.clientId ? { clientId: input.clientId } : {}),
    type: 'access' as const,
  };
  // `jwtid` is supplied as an option (not duplicated inside the payload):
  // jsonwebtoken rejects a token whose payload already carries a `jti`.
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    jwtid: jti,
  };
  const token = jwt.sign(payload, env.JWT_SECRET, options);
  const decoded = jwt.decode(token) as JwtAccessPayload;
  return { token, jti, expiresIn: decoded.exp - decoded.iat };
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { sub: userId, type: 'refresh' as const },
    env.JWT_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'], jwtid: jti },
  );
  return { token, jti };
}

function verifyToken<T>(token: string): T {
  try {
    return jwt.verify(token, env.JWT_SECRET) as T;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Session expired, please sign in again');
    }
    throw AppError.unauthorized('Invalid authentication token');
  }
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  const payload = verifyToken<JwtAccessPayload>(token);
  if (payload.type !== 'access') throw AppError.unauthorized('Invalid token type');
  return payload;
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  const payload = verifyToken<JwtRefreshPayload>(token);
  if (payload.type !== 'refresh') throw AppError.unauthorized('Invalid token type');
  return payload;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Timing-safe string comparison for opaque secrets. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}