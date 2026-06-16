import { IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: 123456789, description: "Telegram user ID" })
  @IsNumber()
  @IsPositive()
  telegramId!: number;
}
