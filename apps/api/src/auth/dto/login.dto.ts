import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@demo.crm', description: 'שם משתמש או דוא"ל' })
  @IsString()
  @MinLength(1)
  identifier!: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @ApiProperty({ required: false, description: 'קוד אימות דו-שלבי' })
  @IsOptional()
  @IsString()
  twoFactorCode?: string;
}

export class RefreshDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
