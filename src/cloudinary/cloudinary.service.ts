import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

@Injectable()
export class CloudinaryService {
  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get("CLOUDINARY_CLOUD_NAME"),
      api_key: config.get("CLOUDINARY_API_KEY"),
      api_secret: config.get("CLOUDINARY_API_SECRET"),
    });
  }

  uploadFile(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: "merchants" }, (error, result) => {
          if (error || !result) {
            return reject(error);
          }

          resolve(result);
        })
        .end(file.buffer);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}
