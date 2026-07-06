import { IsString, IsOptional, IsBoolean, IsArray, IsInt, IsNumber, IsObject, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AdminUpdateMerchantDto {
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

  @ApiProperty({ example: [500, 1000, 2000], required: false })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  nominals?: number[];

  @ApiProperty({ example: 12, required: false })
  @IsOptional()
  @IsNumber()
  validityMonths?: number;

  @ApiProperty({ example: "https://res.cloudinary.com/...", required: false })
  @IsOptional()
  @IsString()
  @Matches(/^https:\/\/res\.cloudinary\.com\//, { message: "logo must be a Cloudinary URL" })
  logo?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: "sierra-coffee", required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "slug must contain only lowercase letters, numbers and hyphens" })
  slug?: string;
}
