import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { CashMovementType } from '@crm/database';

export class OpenShiftDto {
  @ApiProperty({ example: 'register-uuid' })
  @IsString() @MinLength(1) registerId!: string;

  @ApiProperty({ example: 20000, description: 'יתרת פתיחה (אגורות)' })
  @IsInt() @Min(0) openingFloatMinor!: number;
}

export class CloseShiftDto {
  @ApiProperty({ example: 45000, description: 'סכום שנספר בפועל (אגורות)' })
  @IsInt() @Min(0) countedMinor!: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() notes?: string;
}

export class CashMovementDto {
  @ApiProperty({ enum: CashMovementType })
  @IsEnum(CashMovementType) type!: CashMovementType;

  @ApiProperty({ example: 10000 })
  @IsInt() amountMinor!: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() reason?: string;
}
