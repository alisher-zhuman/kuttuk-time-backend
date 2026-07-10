import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from "@nestjs/swagger";
import { memoryStorage } from "multer";
import type { Request } from "express";

import { CloudinaryService } from "@/cloudinary/cloudinary.service";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new BadRequestException("Only image files are allowed"), false);
  }
};

@ApiTags("Upload")
@ApiBearerAuth()
@Controller("upload")
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("merchant", "admin")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiOperation({
    summary: "Upload an image",
    description: "**Roles:** merchant · admin. Max 5MB. Returns Cloudinary URL.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOkResponse({
    schema: {
      example: {
        url: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: "No token provided",
    schema: {
      example: {
        statusCode: 401,
        message: "Unauthorized",
        error: "Unauthorized",
      },
    },
  })
  @ApiForbiddenResponse({
    description: "Requires merchant or admin role",
    schema: {
      example: { statusCode: 403, message: "Forbidden", error: "Forbidden" },
    },
  })
  @ApiBadRequestResponse({
    description: "Not an image, or file exceeds 5MB",
    schema: {
      example: {
        statusCode: 400,
        message: "Only image files are allowed",
        error: "Bad Request",
      },
    },
  })
  async upload(@UploadedFile() file: Express.Multer.File) {
    this.logger.log(`Upload request: ${file.originalname} (${file.size} bytes)`);

    const result = await this.cloudinaryService.uploadFile(file);
    return { url: result.secure_url };
  }
}
