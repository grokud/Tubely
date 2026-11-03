import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { join } from "path"
import { BadRequestError, UserForbiddenError } from "./errors";



export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get("thumbnail");
  if (!(file instanceof File)) {
	  throw new BadRequestError("Thumbnail file missing");
  }

  const MAX_UPLOAD_SIZE = 10485760;
  if (file.size > MAX_UPLOAD_SIZE) {
	  throw new BadRequestError("Exceeds the maximum size");
  }
  

  const video = getVideo(cfg.db, videoId);
  if (video && video.userID !== userID) {
	  throw new UserForbiddenError("Not an owner of the video");
  }

  const imageFormat = file.type;
  switch(imageFormat) {
      case "image/jpeg":
      case "image/png":
       {
         const imageData = await file.arrayBuffer();
         const bytes = new Uint8Array(imageData)
         const fileExtension = imageFormat.split("/")[1];
         const filePath = join(cfg.assetsRoot, videoId, `.${fileExtension}`);
         await Bun.write(filePath, bytes);
         const thumbnailUrl = `http://localhost:${cfg.port}${filePath}`;
         if (video) { 
            video.thumbnailURL = thumbnailUrl;
            updateVideo(cfg.db, video)
         }

         const payload = getVideo(cfg.db, videoId)
         return respondWithJSON(200, payload);
       }
      default:
         throw new BadRequestError("Not an image file format");
  }
   
}
