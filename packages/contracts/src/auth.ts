import { z } from 'zod';
import { Handle, PublicUser } from './user.js';

export const Password = z.string().min(8, 'At least 8 characters').max(128, 'Keep it under 128 characters');

export const RegisterInput = z.object({
  email: z.email('Enter an email address, like you@example.com'),
  handle: Handle,
  displayName: z.string().trim().min(1, 'Tell people what to call you').max(48, 'Keep your name under 48 characters'),
  password: Password,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.email('Enter the email you signed up with'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof LoginInput>;

/** The refresh token never appears here: it travels only in an httpOnly cookie. */
export const Session = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: PublicUser,
});
export type Session = z.infer<typeof Session>;
