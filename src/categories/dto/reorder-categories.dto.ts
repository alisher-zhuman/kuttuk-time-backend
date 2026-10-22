import { ArrayUnique, IsArray, ArrayMinSize, IsInt } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ReorderCategoriesDto {
  @ApiProperty({
    example: [3, 1, 2],
    description: "All category ids, in the desired order",
  })
  @IsArray()
  @ArrayMinSize(1)
  // [1, 1, 2] for {1, 2, 3} used to pass the length check and leave 3 with a stale order.
  @ArrayUnique()
  @IsInt({ each: true })
  ids!: number[];
}
