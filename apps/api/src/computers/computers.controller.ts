import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, paginationQuerySchema, type AuthPrincipal } from '@crm/shared';
import { ComputersService } from './computers.service';
import { CreateComputerDto, RemoteCommandDto, UpdateComputerDto } from './dto/computer.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';

@ApiTags('computers')
@ApiBearerAuth()
@Controller('computers')
export class ComputersController {
  constructor(private readonly computers: ComputersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPUTER_READ)
  @ApiOperation({ summary: 'רשימת מחשבים' })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.computers.list(user, paginationQuerySchema.parse(query));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COMPUTER_READ)
  @ApiOperation({ summary: 'פרטי מחשב' })
  get(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.computers.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMPUTER_MANAGE)
  @ApiOperation({ summary: 'הוספת מחשב' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateComputerDto) {
    return this.computers.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COMPUTER_MANAGE)
  @ApiOperation({ summary: 'עדכון מחשב' })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateComputerDto,
  ) {
    return this.computers.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COMPUTER_MANAGE)
  @ApiOperation({ summary: 'מחיקת מחשב (רכה)' })
  remove(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.computers.remove(user, id);
  }

  @Post(':id/command')
  @RequirePermissions(PERMISSIONS.COMPUTER_REMOTE_CONTROL)
  @ApiOperation({ summary: 'שליחת פקודה מרחוק (מרשימת פעולות מאושרת)' })
  command(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: RemoteCommandDto,
  ) {
    return this.computers.sendCommand(user, id, dto);
  }
}
