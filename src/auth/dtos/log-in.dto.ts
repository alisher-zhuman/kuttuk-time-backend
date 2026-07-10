import { IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LogInDto {
  @ApiProperty({
    example: "query_id=AAH...&user=%7B%22id%22%3A123%7D&auth_date=1234567890&hash=abc123",
    description: "Raw Telegram initData string from window.Telegram.WebApp.initData",
  })
  @IsString()
  initData!: string;
}
