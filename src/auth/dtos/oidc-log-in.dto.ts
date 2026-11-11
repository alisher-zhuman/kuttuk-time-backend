import { ApiProperty } from "@nestjs/swagger";
import { IsJWT, IsOptional, IsString, MaxLength } from "class-validator";

export class OidcLogInDto {
  @ApiProperty({ description: "The id_token Telegram.Login returned (a JWT signed by Telegram)" })
  @IsString()
  @IsJWT()
  @MaxLength(8192)
  idToken!: string;

  @ApiProperty({
    required: false,
    description: "The website guest's token - their purchases move to this Telegram account",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  guestToken?: string;
}
