import { IsNumber, IsPositive } from 'class-validator';

export class LoginDto {
  @IsNumber()
  @IsPositive()
  telegramId!: number;
}
