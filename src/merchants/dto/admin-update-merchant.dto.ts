import { IsBoolean, IsInt, IsNotEmpty, IsPositive, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

import { IsOptionalNotNull } from "@/common/validators";

export class AdminUpdateMerchantDto {
  @ApiProperty({ example: "Sierra Coffee LLC", required: false })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ example: 123456789, required: false })
  @IsOptionalNotNull()
  @IsInt()
  @IsPositive()
  telegramId?: number;

  @ApiProperty({
    example: true,
    description:
      "false hides all of the merchant's venues and blocks editing them; the cabinet and redemption keep working",
    required: false,
  })
  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}
