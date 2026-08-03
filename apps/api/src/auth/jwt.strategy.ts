import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthPrincipal } from '@crm/shared';
import type { AppConfig } from '../config/configuration';

interface JwtPayload {
  sub: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt', { infer: true }).accessSecret,
    });
  }

  /** Return value becomes `request.user` (the AuthPrincipal). */
  validate(payload: JwtPayload): AuthPrincipal {
    return {
      employeeId: payload.sub,
      tenantId: payload.tenantId,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
      branchIds: payload.branchIds ?? [],
    };
  }
}
