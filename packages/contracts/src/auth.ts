import { z } from 'zod';
import { Handle, PublicUser } from './user.js';

export const Password = z.string().min(8, 'At least 8 characters').max(128);

export const RegisterInput = z.object({
  email: z.email(),
  handle: Handle,
  displayName: z.string().trim().min(1).max(48),
  password: Password,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

/** The refresh token never appears here: it travels only in an httpOnly cookie. */
export const Session = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: PublicUser,
});
export type Session = z.infer<typeof Session>;
