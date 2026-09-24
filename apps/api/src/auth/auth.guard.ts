import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from './current-user.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';
import { TokensService } from './tokens.service.js';

/** Global guard: every route needs a valid Bearer access token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Sockets authenticate once, at the handshake (RealtimeGateway); this guard is for HTTP.
    if (ctx.getType() !== 'http') return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Sign in to continue');
    req.user = { id: await this.tokens.verifyAccess(token) };
    return true;
  }
}
