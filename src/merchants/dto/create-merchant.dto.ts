import { IsOptional, MaxLength, IsInt, IsNotEmpty, IsPositive, IsString } from "class-validator";
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
    description: "Admin only: where to transfer the payout. null or empty clears it",
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  payoutDetails?: string | null;

  @ApiProperty({
    example: "+996 555 123 456, Айбек",
    description: "Admin only: how to reach the owner. null or empty clears it",
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contact?: string | null;
}
