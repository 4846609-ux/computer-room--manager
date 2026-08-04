import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, paginationQuerySchema, type AuthPrincipal } from '@crm/shared';
import { SessionsService } from './sessions.service';
import { AddTimeDto, OpenSessionDto, TransferSessionDto } from './dto/session.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SESSION_READ)
  @ApiOperation({ summary: 'שימושים (פעילים/היסטוריה)' })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: Record<string, string>) {
    const active = query.active === 'true';
    return this.sessions.list(user, paginationQuerySchema.parse(query), active);
  }

  @Post('open')
  @RequirePermissions(PERMISSIONS.SESSION_OPEN)
  @ApiOperation({ summary: 'פתיחת שימוש בעמדה' })
  open(@CurrentUser() user: AuthPrincipal, @Body() dto: OpenSessionDto) {
    return this.sessions.open(user, dto);
  }

  @Post(':id/add-time')
  @RequirePermissions(PERMISSIONS.SESSION_MODIFY)
  @ApiOperation({ summary: 'הוספת זמן' })
  addTime(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: AddTimeDto) {
    return this.sessions.addTime(user, id, dto);
  }

  @Post(':id/transfer')
  @RequirePermissions(PERMISSIONS.SESSION_TRANSFER)
  @ApiOperation({ summary: 'העברת שימוש למחשב אחר' })
  transfer(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: TransferSessionDto,
  ) {
    return this.sessions.transfer(user, id, dto);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.SESSION_CLOSE)
  @ApiOperation({ summary: 'סיום שימוש וחישוב חיוב סופי' })
  close(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.sessions.close(user, id);
  }
}
