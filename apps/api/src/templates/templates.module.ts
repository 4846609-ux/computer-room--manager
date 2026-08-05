import { Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { NotificationChannel, Prisma } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class UpsertTemplateDto {
  @ApiProperty({ example: 'SESSION_ENDING', description: 'מפתח תבנית' })
  @IsString() @MinLength(1) key!: string;
  @ApiProperty({ enum: NotificationChannel }) @IsEnum(NotificationChannel) channel!: NotificationChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiProperty({ example: 'שלום {{name}}, נותרו {{minutes}} דקות.' })
  @IsString() @MinLength(1) body!: string;
  @ApiPropertyOptional({ example: 'he' }) @IsOptional() @IsString() language?: string;
}

@Injectable()
class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthPrincipal) {
    return this.prisma.messageTemplate.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ key: 'asc' }, { channel: 'asc' }],
    });
  }

  /** Create or update a template (unique by tenant + key + channel + language). */
  async upsert(user: AuthPrincipal, dto: UpsertTemplateDto) {
    const language = dto.language ?? 'he';
    const data: Prisma.MessageTemplateUncheckedCreateInput = {
      tenantId: user.tenantId,
      key: dto.key,
      channel: dto.channel,
      subject: dto.subject,
      body: dto.body,
      language,
    };
    const template = await this.prisma.messageTemplate.upsert({
      where: {
        tenantId_key_channel_language: {
          tenantId: user.tenantId,
          key: dto.key,
          channel: dto.channel,
          language,
        },
      },
      create: data,
      update: { subject: dto.subject, body: dto.body },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'template.upsert', entity: 'MessageTemplate', entityId: template.id,
      newValue: { key: dto.key, channel: dto.channel },
    });
    return template;
  }
}

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  @ApiOperation({ summary: 'רשימת תבניות הודעה' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.templates.list(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  @ApiOperation({ summary: 'יצירת/עדכון תבנית הודעה' })
  upsert(@CurrentUser() user: AuthPrincipal, @Body() dto: UpsertTemplateDto) {
    return this.templates.upsert(user, dto);
  }
}

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
