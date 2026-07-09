import { IsString, IsOptional, IsArray, IsInt, IsObject, Min, Max, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateMerchantDto {
  @ApiProperty({ example: "Sierra Coffee", required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: { ru: "Лучший кофе в городе", kg: "Шаардагы эң жакшы кофе", en: "Best coffee in the city" },
    required: false,
  })
  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @ApiProperty({ example: [1, 3], description: "Category ids", required: false })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  categories?: number[];

  @ApiProperty({ example: [500, 1000, 2000], description: "Nominals in KGS (500-10000)", required: false })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(500, { each: true })
  @Max(10000, { each: true })
  nominals?: number[];

  @ApiProperty({ example: 12, description: "Certificate validity in months (1-24)", required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  validityMonths?: number;

  @ApiProperty({ example: "https://res.cloudinary.com/...", required: false })
  @IsOptional()
  @IsString()
  @Matches(/^https:\/\/res\.cloudinary\.com\//, { message: "logo must be a Cloudinary URL" })
  logo?: string;
}
