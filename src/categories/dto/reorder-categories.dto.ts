import { IsArray, ArrayMinSize, IsInt } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ReorderCategoriesDto {
  @ApiProperty({
    example: [3, 1, 2],
    description: "All category ids, in the desired order",
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids!: number[];
}
