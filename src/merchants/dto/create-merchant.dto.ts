import { MaxLength, Matches, IsInt, IsNotEmpty, IsPositive, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateMerchantDto {
  @ApiProperty({
    example: "Sierra Coffee LLC",
    description: "Business name (admin, payout report)",
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 123456789, description: "The owner's Telegram ID" })
  @IsInt()
  @IsPositive()
  telegramId!: number;

  @ApiProperty({
    example: "Мбанк 0555 123 456, Айбек Т.",
    description: "Admin only, required: where to transfer the payout, ≤ 500 chars, not blank",
    required: true,
  })
  @IsString()
  @Matches(/\S/, { message: "payoutDetails must not be blank" })
  @MaxLength(500)
  payoutDetails!: string;

  @ApiProperty({
    example: "+996 555 123 456, Айбек",
    description: "Admin only, required: how to reach the owner, ≤ 500 chars, not blank",
    required: true,
  })
  @IsString()
  @Matches(/\S/, { message: "contact must not be blank" })
  @MaxLength(500)
  contact!: string;
}
