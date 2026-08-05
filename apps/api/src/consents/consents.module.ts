import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class CreateConsentDto {
  @ApiProperty({ example: 'TERMS', description: 'TERMS | PRIVACY | USAGE | PARENTAL ...' })
  @IsString() @MinLength(1) key!: string;
  @ApiProperty({ example: 'תנאי שימוש' }) @IsString() @MinLength(1) title!: string;
  @ApiProperty() @IsString() @MinLength(1) content!: string;
}

class SignConsentDto {
  @ApiProperty({ description: 'מפתח מסמך (TERMS ...)' }) @IsString() key!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ip?: string;
}

@Injectable()
class ConsentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** List the latest version of each consent document key. */
  async list(user: AuthPrincipal) {
    const docs = await this.prisma.consentDocument.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });
    const latestByKey = new Map<string, (typeof docs)[number]>();
    for (const d of docs) if (!latestByKey.has(d.key)) latestByKey.set(d.key, d);
    return [...latestByKey.values()];
  }

  async activeFor(user: AuthPrincipal, key: string) {
    const doc = await this.prisma.consentDocument.findFirst({
      where: { tenantId: user.tenantId, key },
      orderBy: { version: 'desc' },
    });
    if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'מסמך לא נמצא' });
    return doc;
  }

  /** Create a new version of a document (versions are immutable). */
  async create(user: AuthPrincipal, dto: CreateConsentDto) {
    const last = await this.prisma.consentDocument.findFirst({
      where: { tenantId: user.tenantId, key: dto.key },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const doc = await this.prisma.consentDocument.create({
      data: {
        tenantId: user.tenantId,
        key: dto.key,
        version: (last?.version ?? 0) + 1,
        title: dto.title,
        content: dto.content,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'consent.create', entity: 'ConsentDocument', entityId: doc.id,
      newValue: { key: dto.key, version: doc.version },
    });
    return doc;
  }

  /** Record a customer's consent to the active version of a document. */
  async sign(user: AuthPrincipal, customerId: string, dto: SignConsentDto) {
    const doc = await this.activeFor(user, dto.key);
    const consent = await this.prisma.customerConsent.create({
      data: {
        tenantId: user.tenantId,
        customerId,
        documentId: doc.id,
        version: doc.version,
        ip: dto.ip,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'consent.sign', entity: 'CustomerConsent', entityId: consent.id,
      newValue: { key: dto.key, version: doc.version, customerId },
    });
    return consent;
  }
}

@ApiTags('consents')
@ApiBearerAuth()
@Controller()
class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Get('consents')
  @RequirePermissions(PERMISSIONS.CONSENT_MANAGE)
  @ApiOperation({ summary: 'רשימת מסמכי הסכמה' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.consents.list(user);
  }

  @Post('consents')
  @RequirePermissions(PERMISSIONS.CONSENT_MANAGE)
  @ApiOperation({ summary: 'יצירת/עדכון מסמך הסכמה (גרסה חדשה)' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateConsentDto) {
    return this.consents.create(user, dto);
  }

  @Post('customers/:id/consent')
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  @ApiOperation({ summary: 'תיעוד הסכמת לקוח' })
  sign(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: SignConsentDto) {
    return this.consents.sign(user, id, dto);
  }
}

@Module({
  controllers: [ConsentsController],
  providers: [ConsentsService],
})
export class ConsentsModule {}
