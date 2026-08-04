import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@crm/database';

export enum SaleItemKind {
  PRODUCT = 'PRODUCT',
  PACKAGE = 'PACKAGE',
  CUSTOM = 'CUSTOM',
}

export class SaleItemInput {
  @ApiProperty({ enum: SaleItemKind })
  @IsEnum(SaleItemKind) kind!: SaleItemKind;

  @ApiPropertyOptional({ description: 'מזהה מוצר/חבילה' })
  @IsOptional() @IsString() refId?: string;

  @ApiPropertyOptional({ description: 'תיאור (לפריט חופשי)' })
  @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @IsInt() @Min(1) quantity?: number;

  @ApiPropertyOptional({ description: 'מחיר יחידה (אגורות) — נדרש לפריט חופשי' })
  @IsOptional() @IsInt() @Min(0) unitPriceMinor?: number;
}

export class PaymentInput {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod) method!: PaymentMethod;

  @ApiProperty({ example: 5000, description: 'סכום ששולם (אגורות)' })
  @IsInt() @Min(0) amountMinor!: number;
}

export class CreateSaleDto {
  @ApiPropertyOptional({ description: 'לקוח (חובה עבור חבילות)' })
  @IsOptional() @IsString() customerId?: string;

  @ApiProperty({ example: 'branch-uuid' })
  @IsString() @MinLength(1) branchId!: string;

  @ApiPropertyOptional({ description: 'משמרת קופה פעילה' })
  @IsOptional() @IsString() cashShiftId?: string;

  @ApiProperty({ type: [SaleItemInput] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SaleItemInput)
  items!: SaleItemInput[];

  @ApiPropertyOptional({ type: PaymentInput, description: 'תשלום מיידי (אופציונלי)' })
  @IsOptional() @ValidateNested() @Type(() => PaymentInput)
  payment?: PaymentInput;
}

export class RefundDto {
  @ApiProperty({ example: 5000 })
  @IsInt() @Min(1) amountMinor!: number;

  @ApiProperty({ example: 'ביטול עסקה בטעות' })
  @IsString() @MinLength(1) reason!: string;
}
