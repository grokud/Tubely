import  type { BunRequest } from "bun";
//import { unlink } from "node:fs/promises";
//import { S3Client } from "bun";
import { randomBytes } from "node:crypto";
import { join } from "path";
import { respondWithJSON } from "./json";
import { BadRequestError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { type ApiConfig } from "../config";



async function processVideoForFastStart(inputFilePath: string) {
    const outputFilePath = `${inputFilePath}.processed`;
    const proc = Bun.spawn([
        "ffmpeg",
        "-i",
        inputFilePath,
        "-movflags",
        "faststart",
        "-map_metadata",
        "0",
        "-codec",
        "copy",
        "-f",
        "mp4",
        outputFilePath,
    ], {
        stderr: "pipe",
        stdout: "pipe",
    });

    const [stderr, exitCode] = await Promise.all([
        new Response(proc.stderr).text(),
        proc.exited,
    ]);

    if (exitCode !== 0) { throw new Error(stderr.trim()); }
    return outputFilePath;
}


async function getVideoAspectRatio(filePath: string) {
    const proc = Bun.spawn([
        "ffprobe",
        "-v", 
        "error", 
        "-select_streams", 
        "v:0", 
        "-show_entries", 
        "stream=width,height", 
        "-of", 
        "json", 
        filePath
], {
        stdout: "pipe",
        stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).json(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);

    if (exitCode !== 0) {
        throw new Error(stderr.trim());
    }
    
    let streamObj = {};
    streamObj = stdout["streams"][0];
    const width: number = streamObj["width" as keyof typeof streamObj];
    const length: number = streamObj["height"as keyof typeof streamObj];
    if (width * 9 === length * 16) {
        return "landscape";
    } else if (width * 16 === length * 9) {
        return "portrait";
    } else {
        return "other";
    }

}

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_VID_UPLOAD_SIZE = 1073741824; 
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
      throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);
  console.log(`uploading video ${videoId} by user ${userID}\n`);

  const video = getVideo(cfg.db, videoId);
  if (video && video.userID !== userID) {
      throw new UserForbiddenError("Not an owner of the video");
  }

  const formData = await req.formData();
  const videoFile = formData.get("video");
  if (!(videoFile instanceof File)) {
      throw new BadRequestError("Video file missing");
  }

  if (videoFile.size > MAX_VID_UPLOAD_SIZE) {
      throw new BadRequestError("Exceeds the maximum size");
  }

  if (!videoFile.type.startsWith("video/") && !videoFile.type.endsWith("mp4")) {
      throw new BadRequestError("Not the correct video file Format");
  }

  const videoData = await videoFile.arrayBuffer();
  const randomString = randomBytes(32).toString("base64url");
  const filePath = join(cfg.assetsRoot, `${randomString}.mp4`);
  await Bun.write(filePath, videoData);

  const processedFilePath = await processVideoForFastStart(filePath);
  const aspectRatio = await getVideoAspectRatio(filePath);
  console.log(processedFilePath, aspectRatio);
  /*
   * put the video object into S3
  try { 
      const aspectRatio = await getVideoAspectRatio(filePath);
      const processedFilePath = await processVideoForFastStart(filePath);

      const s3file = S3Client.file(`${aspectRatio}/${filePath}`); 
   * or upload the processed faststart video

      const s3file = S3Client.file(processedFilePath);
      await s3file.write(videoData, {
          type: "video/mp4"
      });
      await unlink(filePath);
  } catch (err) { throw err }
  */ 
 const base = `http://localhost:${cfg.port}`;
 const fileName = `${randomString}.mp4`;
 const videoUrl = new URL(`/assets/${fileName}`, base).href;
 if (video) { 
     video.videoURL = videoUrl;
     updateVideo(cfg.db, video);
 } 

 const payload = getVideo(cfg.db, videoId);
 return respondWithJSON(200, payload);
}
