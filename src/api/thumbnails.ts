import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, UserForbiddenError } from "./errors";



export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  // TODO: implement the upload here
  const formData = await req.formData();
  const file = formData.get("thumbnail");
  if (!(file instanceof File)) {
	  throw new BadRequestError("Thumbnail file missing");
  }

  const MAX_UPLOAD_SIZE = 10485760;
  if (file.size > MAX_UPLOAD_SIZE) {
	  throw new BadRequestError("Exceeds the maximum size");
  }

  const imageData = await file.arrayBuffer();
  const video = getVideo(cfg.db, videoId);
  if (video && video.userID !== userID) {
	  throw new UserForbiddenError("Not an owner of the video");
  }

 // upload thumbnail 
 // encode the image into string and store in the table
  const buffer = Buffer.from(imageData)
  const text = buffer.toString('base64');
  const mediaType = "text/plian";
  const dataUrl = `data: ${mediaType};base64,${text}`;
  if (video) { 
      video.thumbnailURL = dataUrl;
      updateVideo(cfg.db, video)
  }
 
  
  const payload = getVideo(cfg.db, videoId)
  return respondWithJSON(200, payload);
}
