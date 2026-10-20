import { IsInt, IsNotEmpty, IsPositive, IsString } from "class-validator";
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
}
