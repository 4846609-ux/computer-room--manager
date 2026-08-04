import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, paginationQuerySchema, type AuthPrincipal } from '@crm/shared';
import { CustomersService } from './customers.service';
import {
  BlockCustomerDto,
  CreateCustomerDto,
  LoadBalanceDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'רשימת/חיפוש לקוחות' })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.customers.list(user, paginationQuerySchema.parse(query));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'כרטיס לקוח' })
  get(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.customers.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMER_CREATE)
  @ApiOperation({ summary: 'יצירת לקוח' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  @ApiOperation({ summary: 'עדכון לקוח' })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(user, id, dto);
  }

  @Post(':id/block')
  @RequirePermissions(PERMISSIONS.CUSTOMER_BLOCK)
  @ApiOperation({ summary: 'חסימת לקוח' })
  block(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: BlockCustomerDto,
  ) {
    return this.customers.block(user, id, dto);
  }

  @Post(':id/balance/load')
  @RequirePermissions(PERMISSIONS.BALANCE_LOAD)
  @ApiOperation({ summary: 'טעינת יתרה (כסף/זמן/הדפסות)' })
  loadBalance(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: LoadBalanceDto,
  ) {
    return this.customers.loadBalance(user, id, dto);
  }

  @Get(':id/balance/transactions')
  @RequirePermissions(PERMISSIONS.BALANCE_READ)
  @ApiOperation({ summary: 'תנועות יתרה (ledger)' })
  transactions(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ) {
    return this.customers.transactions(user, id, paginationQuerySchema.parse(query));
  }
}
