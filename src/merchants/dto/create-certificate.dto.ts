import { IsString, IsNotEmpty, IsOptional, IsInt, IsPositive } from "class-validator";

export class CreateCertificateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @IsPositive()
  price!: number;
}
