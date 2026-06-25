import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { CloudinaryService } from "@/cloudinary/cloudinary.service";

@ApiTags("Upload")
@ApiBearerAuth()
@Controller("upload")
export class UploadController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({
    summary: "Upload an image",
    description: "**Roles:** user · merchant · admin. Max 5MB. Returns Cloudinary URL.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOkResponse({ schema: { example: { url: "https://res.cloudinary.com/..." } } })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  async upload(@UploadedFile() file: Express.Multer.File) {
    const result = await this.cloudinaryService.uploadFile(file);
    return { url: result.secure_url };
  }
}
