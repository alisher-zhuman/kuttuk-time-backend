import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsPositive } from "class-validator";

export class CreateOrderDto {
  @ApiProperty({ example: 9 })
  @IsInt()
  @IsPositive()
  venueId!: number;

  @ApiProperty({ example: 1000, description: "Must be one of the venue's current nominals" })
  @IsInt()
  @IsPositive()
  nominal!: number;

  @ApiProperty({
    example: "web",
    required: false,
    enum: ["telegram", "web"],
    description:
      "Where the order is placed: `web` - the website (after paying, Finik sends the buyer back to the website's order page); default `telegram` - the Mini App",
  })
  @IsOptional()
  @IsIn(["telegram", "web"])
  channel?: "telegram" | "web";
}
