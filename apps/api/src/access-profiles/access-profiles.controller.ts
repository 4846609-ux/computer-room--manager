import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  accessProfileSchema,
  paginationQuerySchema,
  updateAccessProfileSchema,
  type AuthPrincipal,
} from '@crm/shared';
import { AccessProfilesService } from './access-profiles.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

@ApiTags('access-profiles')
@ApiBearerAuth()
@Controller('access-profiles')
export class AccessProfilesController {
  constructor(private readonly service: AccessProfilesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ACCESS_PROFILE_READ)
  @ApiOperation({ summary: 'רשימת פרופילי גישה (רמות משתמש)' })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.service.list(user, paginationQuerySchema.parse(query));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ACCESS_PROFILE_READ)
  @ApiOperation({ summary: 'פרטי פרופיל גישה' })
  get(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post('ensure-defaults')
  @RequirePermissions(PERMISSIONS.ACCESS_PROFILE_MANAGE)
  @ApiOperation({ summary: 'יצירת רמות ברירת מחדל (מחשב בלבד / אימייל בלבד / מלא)' })
  ensureDefaults(@CurrentUser() user: AuthPrincipal) {
    return this.service.ensureDefaults(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ACCESS_PROFILE_MANAGE)
  @ApiOperation({ summary: 'יצירת פרופיל גישה' })
  create(@CurrentUser() user: AuthPrincipal, @Body() body: unknown) {
    return this.service.create(user, accessProfileSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ACCESS_PROFILE_MANAGE)
  @ApiOperation({ summary: 'עדכון פרופיל גישה' })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(user, id, updateAccessProfileSchema.parse(body));
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ACCESS_PROFILE_MANAGE)
  @ApiOperation({ summary: 'מחיקת פרופיל גישה' })
  remove(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
