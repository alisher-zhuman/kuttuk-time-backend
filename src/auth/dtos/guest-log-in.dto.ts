import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class GuestLogInDto {
  @ApiProperty({
    required: false,
    description:
      "The guestToken from an earlier answer (the browser keeps it). Omitted, unknown or malformed → a new guest",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  guestToken?: string;
}
