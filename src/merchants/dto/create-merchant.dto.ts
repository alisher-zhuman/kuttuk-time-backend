import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateMerchantDto {
  @ApiProperty({ example: "Coffee House", description: "Merchant name" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: "Best coffee in town", required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: "+996 700 123456", required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 123456789, description: "Owner Telegram ID" })
  @IsNumber()
  @IsPositive()
  ownerTelegramId!: number;
}
