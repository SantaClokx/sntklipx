hereconst express = require("express");
const cors = require("cors");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = Number(process.env.PORT || 8080);
const TEMP_DIR = process.env.TEMP_DIR || "/tmp/sntklipx";

fs.mkdirSync(TEMP_DIR, { recursive: true });

app.disable("x-powered-by");

app.use(cors());

app.use(
  express.json({
    limit: "16kb",
  })
);

app.use(express.urlencoded({ extended: true }));

/*
|--------------------------------------------------------------------------
| yt-dlp runner
|--------------------------------------------------------------------------
*/

function runYtDlp(args, timeout = 180000) {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      args,
      {
        maxBuffer: 20 * 1024 * 1024,
        timeout,
      },
      (error, stdout, stderr) => {
        if (error) {
          const message =
            stderr?.trim() ||
            error.message ||
            "yt-dlp failed";

          const ytError = new Error(message);
          ytError.code = error.code;

          return reject(ytError);
        }

        resolve(stdout);
      }
    );
  });
}

/*
|--------------------------------------------------------------------------
| URL extraction
|--------------------------------------------------------------------------
*/

function getUrl(req) {
  return String(
    req.body?.url ||
      req.query?.url ||
      ""
  ).trim();
}

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "sntklipx-api",
    status: "running",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sntklipx-api",
  });
});

/*
|--------------------------------------------------------------------------
| INSPECT
|--------------------------------------------------------------------------
*/

async function inspectHandler(req, res) {
  const url = getUrl(req);

  if (!url) {
    return res.status(400).json({
      ok: false,
      error: "Missing URL",
    });
  }

  try {
    const output = await runYtDlp(
      [
        "-J",
        "--no-playlist",
        url,
      ],
      120000
    );

    const info = JSON.parse(output);

    return res.json({
      ok: true,
      title: info.title || "Untitled video",
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader:
        info.uploader ||
        info.channel ||
        null,
      platform:
        info.extractor_key ||
        info.extractor ||
        null,
    });
  } catch (error) {
    console.error(
      "Inspect failed:",
      error.message
    );

    return res.status(502).json({
      ok: false,
      error:
        "Unable to inspect this media URL.",
    });
  }
}

app.get(
  "/api/inspect",
  inspectHandler
);

app.post(
  "/api/inspect",
  inspectHandler
);

/*
|--------------------------------------------------------------------------
| DOWNLOAD
|--------------------------------------------------------------------------
*/

async function downloadHandler(req, res) {
  const url = getUrl(req);

  const format = String(
    req.body?.format ||
      req.query?.format ||
      "MP4 HD"
  )
    .trim()
    .toLowerCase();

  if (!url) {
    return res.status(400).json({
      ok: false,
      error: "Missing URL",
    });
  }

  const id = crypto
    .randomBytes(8)
    .toString("hex");

  const outputTemplate = path.join(
    TEMP_DIR,
    `${id}.%(ext)s`
  );

  let args;

  /*
   * MP3 / AUDIO
   */

  if (
    format.includes("audio") ||
    format.includes("mp3")
  ) {
    args = [
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--no-playlist",
      "-o",
      outputTemplate,
      url,
    ];
  }

  /*
   * MP4 HD
   */

  else if (
    format.includes("hd")
  ) {
    args = [
      "-f",
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "-o",
      outputTemplate,
      url,
    ];
  }

  /*
   * STANDARD MP4
   */

  else {
    args = [
      "-f",
      "best[ext=mp4]/best",
      "--no-playlist",
      "-o",
      outputTemplate,
      url,
    ];
  }

  try {
    await runYtDlp(
      args,
      180000
    );

    const producedFiles =
      fs
        .readdirSync(TEMP_DIR)
        .filter((file) =>
          file.startsWith(`${id}.`)
        );

    if (!producedFiles.length) {
      throw new Error(
        "yt-dlp produced no output file"
      );
    }

    const filename =
      producedFiles[0];

    const filePath = path.join(
      TEMP_DIR,
      filename
    );

    const isAudio =
      filename
        .toLowerCase()
        .endsWith(".mp3");

    const extension = isAudio
      ? "mp3"
      : "mp4";

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sntklipx-${id}.${extension}"`
    );

    res.setHeader(
      "Content-Type",
      isAudio
        ? "audio/mpeg"
        : "video/mp4"
    );

    const stream =
      fs.createReadStream(filePath);

    const cleanup = () => {
      fs.rm(
        filePath,
        {
          force: true,
        },
        () => {}
      );
    };

    stream.on(
      "error",
      (error) => {
        console.error(
          "Stream failed:",
          error.message
        );

        cleanup();

        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error:
              "Failed to stream downloaded media.",
          });
        }
      }
    );

    stream.on(
      "close",
      cleanup
    );

    stream.pipe(res);
  } catch (error) {
    console.error(
      "Download failed:",
      error.message
    );

    const files =
      fs
        .readdirSync(TEMP_DIR)
        .filter((file) =>
          file.startsWith(`${id}.`)
        );

    for (const file of files) {
      fs.rm(
        path.join(TEMP_DIR, file),
        {
          force: true,
        },
        () => {}
      );
    }

    if (!res.headersSent) {
      res.status(502).json({
        ok: false,
        error:
          "Unable to download this media URL.",
      });
    }
  }
}

/*
|--------------------------------------------------------------------------
| Download routes
|--------------------------------------------------------------------------
*/

app.get(
  "/api/download",
  downloadHandler
);

app.post(
  "/api/download",
  downloadHandler
);

/*
|--------------------------------------------------------------------------
| Global error handler
|--------------------------------------------------------------------------
*/

app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {
    console.error(error);

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error:
          "Internal server error.",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `sntklipx API listening on port ${PORT}`
    );
  }
);
