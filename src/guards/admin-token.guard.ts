import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token || token !== this.config.getOrThrow<string>('adminApiToken')) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
