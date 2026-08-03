import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { paginationQuerySchema } from '@crm/shared';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BRANCH_READ)
  @ApiOperation({ summary: 'רשימת סניפים' })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: Record<string, string>) {
    const parsed = paginationQuerySchema.parse(query);
    return this.branches.list(user, parsed);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.BRANCH_READ)
  @ApiOperation({ summary: 'פרטי סניף' })
  get(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.branches.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BRANCH_CREATE)
  @ApiOperation({ summary: 'יצירת סניף' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateBranchDto) {
    return this.branches.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.BRANCH_UPDATE)
  @ApiOperation({ summary: 'עדכון סניף' })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branches.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.BRANCH_DELETE)
  @ApiOperation({ summary: 'מחיקת סניף (רכה)' })
  remove(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.branches.remove(user, id);
  }
}
