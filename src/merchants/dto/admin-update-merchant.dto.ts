import {
  Matches,
  MaxLength,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
} from "class-validator";
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

  @ApiProperty({
    example: "Мбанк 0555 123 456, Айбек Т.",
    description:
      "Admin only, may be omitted, never cleared: where to transfer the payout, ≤ 500 chars, not blank",
    required: false,
  })
  @IsOptionalNotNull()
  @IsString()
  @Matches(/\S/, { message: "payoutDetails must not be blank" })
  @MaxLength(500)
  payoutDetails?: string;

  @ApiProperty({
    example: "+996 555 123 456, Айбек",
    description:
      "Admin only, may be omitted, never cleared: how to reach the owner, ≤ 500 chars, not blank",
    required: false,
  })
  @IsOptionalNotNull()
  @IsString()
  @Matches(/\S/, { message: "contact must not be blank" })
  @MaxLength(500)
  contact?: string;
}
