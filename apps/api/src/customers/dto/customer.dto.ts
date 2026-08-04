import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { BalanceUnit } from '@crm/database';

export class CreateCustomerDto {
  @ApiProperty({ example: 'משה כהן' })
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryBranchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class LoadBalanceDto {
  @ApiProperty({ enum: BalanceUnit, example: BalanceUnit.MONEY })
  @IsEnum(BalanceUnit)
  unit!: BalanceUnit;

  @ApiProperty({ example: 5000, description: 'כמות ביחידות הקטנות (אגורות/שניות/דפים)' })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BlockCustomerDto {
  @ApiProperty({ example: 'חוב שלא שולם' })
  @IsString()
  @MinLength(1)
  reason!: string;
}
