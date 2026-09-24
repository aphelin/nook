import { Body, Controller, HttpCode, HttpStatus, Inject, Ip, NotFoundException, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { LoginInput, RegisterInput, type Session } from '@nook/contracts';
import type { Request, Response } from 'express';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ENV, type Env } from '../config/env.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import { Public } from './public.decorator.js';
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from './session-cookies.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(RegisterInput)) input: RegisterInput,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Session> {
    await this.limiter.hit(`register:${ip}`, this.env.REGISTER_LIMIT_PER_HOUR, 3600);
    return this.respond(res, await this.auth.register(input, req.get('user-agent')));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginInput)) input: LoginInput,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Session> {
    await this.limiter.hit(`login:${ip}:${input.email.toLowerCase()}`, 10, 60);
    return this.respond(res, await this.auth.login(input, req.get('user-agent')));
  }

  /** The landing page's "Try the demo": one click, signed in as the fictional demo member. */
  @Post('demo')
  @HttpCode(HttpStatus.OK)
  async demo(@Ip() ip: string, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<Session> {
    if (!this.env.DEMO_LOGIN) throw new NotFoundException('Not found');
    await this.limiter.hit(`demo:${ip}`, 20, 600);
    return this.respond(res, await this.auth.demo(this.env.DEMO_EMAIL, req.get('user-agent')));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<Session> {
    const raw = this.readRefresh(req);
    if (!raw) throw new UnauthorizedException('Please sign in again');
    try {
      return this.respond(res, await this.auth.refresh(raw, req.get('user-agent')));
    } catch (err) {
      clearSessionCookies(res, this.env.COOKIE_SECURE);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.readRefresh(req));
    clearSessionCookies(res, this.env.COOKIE_SECURE);
  }

  private readRefresh(req: Request): string | undefined {
    const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private respond(res: Response, { refresh, ...session }: IssuedSession): Session {
    setSessionCookies(res, refresh, this.env.COOKIE_SECURE);
    return session;
  }
}
