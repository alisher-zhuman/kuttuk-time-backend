import { IsString, IsOptional, IsInt, IsPositive, IsBoolean } from "class-validator";

export class UpdateCertificateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
