import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class WidgetLogInDto {
  @ApiProperty({
    description:
      "Exactly what the Telegram Login Widget returned (id, first_name, last_name?, username?, photo_url?, auth_date, hash) - unchanged, the signature covers it",
    example: { id: 123456789, first_name: "Айбек", auth_date: 1794380000, hash: "ab12…" },
  })
  @IsObject()
  authData!: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: "The website guest's token - their purchases move to this Telegram account",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  guestToken?: string;
}
