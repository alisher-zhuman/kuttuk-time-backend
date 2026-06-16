import { IsString, IsOptional, IsInt, IsPositive, IsBoolean } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateCertificateDto {
  @ApiProperty({ example: "Updated name", required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: "Updated description", required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 600, required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  price?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
