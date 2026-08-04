import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { EmployeeStatus } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { PasswordService } from '../auth/password.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class CreateEmployeeDto {
  @ApiProperty({ example: 'דנה לוי' }) @IsString() @MinLength(1) fullName!: string;
  @ApiProperty({ example: 'dana@demo.crm' }) @IsEmail() email!: string;
  @ApiProperty({ example: 'Passw0rd!' }) @IsString() @MinLength(8) password!: string;
  @ApiProperty({ type: [String], example: ['CASHIER'] })
  @IsArray() @ArrayNotEmpty() roleKeys!: string[];
  @ApiPropertyOptional({ type: [String], description: 'סניפים מורשים (ריק = כל הסניפים)' })
  @IsOptional() @IsArray() branchIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cashCode?: string;
}

class UpdateEmployeeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({ description: 'ACTIVE | SUSPENDED | INACTIVE' })
  @IsOptional() @IsString() status?: EmployeeStatus;
}

class SetPinDto {
  @ApiProperty({ example: '1234' }) @IsString() @MinLength(4) pin!: string;
}

@Injectable()
class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
  ) {}

  list(user: AuthPrincipal) {
    return this.prisma.employee.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, fullName: true, email: true, phone: true, status: true,
        twoFactorEnabled: true, lastLoginAt: true,
        roles: { include: { role: { select: { key: true, name: true } } } },
      },
    });
  }

  async create(user: AuthPrincipal, dto: CreateEmployeeDto) {
    const exists = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, email: dto.email.toLowerCase() },
    });
    if (exists) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'דוא"ל כבר קיים' });

    const roles = await this.prisma.role.findMany({
      where: { tenantId: user.tenantId, key: { in: dto.roleKeys } },
    });
    if (roles.length === 0) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'תפקיד לא תקין' });

    const passwordHash = await this.passwords.hash(dto.password);
    const employee = await this.prisma.employee.create({
      data: {
        tenantId: user.tenantId,
        fullName: dto.fullName,
        email: dto.email.toLowerCase(),
        passwordHash,
        phone: dto.phone,
        cashCode: dto.cashCode,
        roles: {
          create: roles.map((r) => ({
            tenantId: user.tenantId,
            roleId: r.id,
            branchIds: dto.branchIds ?? [],
          })),
        },
      },
      select: { id: true, fullName: true, email: true },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'employee.create', entity: 'Employee', entityId: employee.id,
      newValue: { email: employee.email, roles: dto.roleKeys },
    });
    return employee;
  }

  async update(user: AuthPrincipal, id: string, dto: UpdateEmployeeDto) {
    const before = await this.prisma.employee.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'עובד לא נמצא' });
    const employee = await this.prisma.employee.update({
      where: { id },
      data: dto,
      select: { id: true, fullName: true, status: true },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'employee.update', entity: 'Employee', entityId: id, newValue: dto,
    });
    return employee;
  }

  async setPin(user: AuthPrincipal, id: string, dto: SetPinDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException({ code: 'NOT_FOUND', message: 'עובד לא נמצא' });
    const pinHash = await this.passwords.hash(dto.pin);
    await this.prisma.employee.update({ where: { id }, data: { pinHash } });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'employee.set_pin', entity: 'Employee', entityId: id,
    });
    return { success: true };
  }

  listRoles(user: AuthPrincipal) {
    return this.prisma.role.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, key: true, name: true, isSystem: true },
      orderBy: { key: 'asc' },
    });
  }
}

@ApiTags('employees')
@ApiBearerAuth()
@Controller()
class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'רשימת עובדים' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.employees.list(user);
  }

  @Post('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @ApiOperation({ summary: 'הוספת עובד' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user, dto);
  }

  @Patch('employees/:id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @ApiOperation({ summary: 'עדכון עובד' })
  update(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(user, id, dto);
  }

  @Post('employees/:id/pin')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @ApiOperation({ summary: 'הגדרת PIN לעובד' })
  setPin(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: SetPinDto) {
    return this.employees.setPin(user, id, dto);
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'רשימת תפקידים' })
  roles(@CurrentUser() user: AuthPrincipal) {
    return this.employees.listRoles(user);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
