import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsPositive } from "class-validator";

export class CreateOrderDto {
  @ApiProperty({ example: 9 })
  @IsInt()
  @IsPositive()
  venueId!: number;

  @ApiProperty({ example: 1000, description: "Must be one of the venue's current nominals" })
  @IsInt()
  @IsPositive()
  nominal!: number;
}
