import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { join } from "path"
import { randomBytes } from "node:crypto";
import { BadRequestError, UserForbiddenError } from "./errors";



export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 10485760;
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

  if (file.size > MAX_UPLOAD_SIZE) {
	  throw new BadRequestError("Exceeds the maximum size");
  }
  

  const video = getVideo(cfg.db, videoId);
  if (video && video.userID !== userID) {
	  throw new UserForbiddenError("Not an owner of the video");
  }

  const imageFormat = file.type;
  if (!imageFormat.startsWith("image/")) {
      throw new BadRequestError("Not an image file format");
  }

  const randomString = randomBytes(32).toString("base64url");


  const imageData = await file.arrayBuffer();
  const fileExtension = imageFormat.split("/")[1];
  const filePath = join(cfg.assetsRoot, `${randomString}.${fileExtension}`);
  await Bun.write(filePath, imageData);

  const base = `http://localhost:${cfg.port}`;
  const fileName = `${randomString}.${fileExtension}`;
  const thumbnailUrl = new URL(`/assets/${fileName}`, base).href;
  if (video) { 
      video.thumbnailURL = thumbnailUrl;
      updateVideo(cfg.db, video)
  }

  const payload = getVideo(cfg.db, videoId)
  return respondWithJSON(200, payload);

}
