import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { DeviceType } from '@crm/database';

export class CreateComputerDto {
  @ApiProperty({ example: 'עמדה 7' })
  @IsString() @MinLength(1) name!: string;

  @ApiProperty({ example: 'branch-uuid' })
  @IsString() branchId!: string;

  @ApiProperty({ example: 'DEMO-PC-007', description: 'מזהה מערכת ייחודי' })
  @IsString() @MinLength(1) systemId!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() stationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() roomId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() groupId?: string;

  @ApiPropertyOptional({ enum: DeviceType })
  @IsOptional() @IsString() deviceType?: DeviceType;

  @ApiPropertyOptional()
  @IsOptional() @IsString() notes?: string;
}

export class UpdateComputerDto extends PartialType(CreateComputerDto) {}

export class RemoteCommandDto {
  @ApiProperty({ example: 'RESTART', description: 'פעולה מרשימת הפעולות המאושרת' })
  @IsString() action!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional() @IsObject() params?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'בצע מיד גם אם משתמש מחובר' })
  @IsOptional() @IsBoolean() force?: boolean;

  @ApiPropertyOptional({ description: 'בצע בסיום השימוש' })
  @IsOptional() @IsBoolean() afterSessionEnd?: boolean;
}
