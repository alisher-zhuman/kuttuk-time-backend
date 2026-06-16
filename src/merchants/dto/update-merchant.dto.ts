import { IsString, IsOptional, IsBoolean } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateMerchantDto {
  @ApiProperty({ example: "New Name", required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: "Updated description", required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: "+996 700 000000", required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
