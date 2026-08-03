import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthPrincipal } from '@crm/shared';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { CurrentUser, Public } from '../common/decorators';

const REFRESH_COOKIE = 'crm_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'כניסת עובד' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login({ ...dto, rememberMe: dto.rememberMe ?? false });
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, principal: result.principal };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'רענון אסימון גישה' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    const result = await this.auth.refresh(raw ?? '');
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'יציאה' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { success: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'פרטי המשתמש המחובר' })
  me(@CurrentUser() user: AuthPrincipal) {
    return this.auth.me(user);
  }
}
