import { Body, Controller, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { AgentCommandStatus } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { AgentService, type HeartbeatInput } from './agent.service';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';

class ProvisionDto {
  @ApiProperty({ example: 'computer-uuid' })
  @IsString() @MinLength(1) computerId!: string;
}

class RegisterDto {
  @ApiProperty({ description: 'טוקן התקנה חד-פעמי' })
  @IsString() @MinLength(1) installToken!: string;

  @ApiProperty({ example: 'DEMO-PC-007' })
  @IsString() @MinLength(1) systemId!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() version?: string;
}

class HeartbeatDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() cpuPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() ramPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() diskFreeMb?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() loggedInUser?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() localIp?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agentVersion?: string;
  @ApiPropertyOptional() @IsOptional() antivirusOk?: boolean;
}

class CommandResultDto {
  @ApiProperty({ enum: AgentCommandStatus })
  @IsString() status!: AgentCommandStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsString() detail?: string;
}

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('provision')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.AGENT_INSTALL)
  @ApiOperation({ summary: 'יצירת טוקן התקנה למחשב' })
  provision(@CurrentUser() user: AuthPrincipal, @Body() dto: ProvisionDto) {
    return this.agent.provision(user, dto.computerId);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'רישום Agent באמצעות טוקן התקנה' })
  register(@Body() dto: RegisterDto) {
    return this.agent.register(dto.installToken, dto.systemId, dto.version);
  }

  @Public()
  @Post('heartbeat')
  @ApiOperation({ summary: 'Heartbeat + קבלת פקודות ממתינות' })
  heartbeat(
    @Headers('x-agent-id') agentId: string | undefined,
    @Headers('x-agent-secret') secret: string | undefined,
    @Body() dto: HeartbeatDto,
  ) {
    if (!agentId || !secret) throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'חסרים פרטי Agent' });
    return this.agent.heartbeat(agentId, secret, dto as HeartbeatInput);
  }

  @Public()
  @Post('commands/:id/result')
  @ApiOperation({ summary: 'דיווח תוצאת פקודה' })
  commandResult(
    @Headers('x-agent-id') agentId: string | undefined,
    @Headers('x-agent-secret') secret: string | undefined,
    @Param('id') commandId: string,
    @Body() dto: CommandResultDto,
  ) {
    if (!agentId || !secret) throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'חסרים פרטי Agent' });
    return this.agent.commandResult(agentId, secret, commandId, dto.status, dto.detail);
  }
}
