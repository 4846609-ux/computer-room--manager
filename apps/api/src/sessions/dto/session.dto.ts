import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SessionBillingSource } from '@crm/database';

export class OpenSessionDto {
  @ApiProperty({ example: 'computer-uuid' })
  @IsString() computerId!: string;

  @ApiPropertyOptional({ example: 'customer-uuid' })
  @IsOptional() @IsString() customerId?: string;

  @ApiProperty({ enum: SessionBillingSource, example: SessionBillingSource.MONEY_BALANCE })
  @IsEnum(SessionBillingSource) billingSource!: SessionBillingSource;

  @ApiPropertyOptional({ description: 'לחבילת זמן — משך מתוכנן בשניות' })
  @IsOptional() @IsInt() @Min(1) plannedSeconds?: number;
}

export class AddTimeDto {
  @ApiProperty({ example: 600, description: 'שניות להוספה' })
  @IsInt() @Min(1) seconds!: number;
}

export class TransferSessionDto {
  @ApiProperty({ example: 'computer-uuid', description: 'מחשב יעד' })
  @IsString() toComputerId!: string;
}
