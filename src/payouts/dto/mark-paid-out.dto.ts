import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsPositive, IsString, Matches, MaxLength } from "class-validator";

export class MarkPaidOutDto {
  @ApiProperty({ example: 10 })
  @IsInt()
  @IsPositive()
  merchantId!: number;

  @ApiProperty({ example: "2026-10-19", description: "Any date inside the payout week" })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "week must be YYYY-MM-DD" })
  week!: string;

  @ApiProperty({ example: "Mbank transfer 27.10", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
