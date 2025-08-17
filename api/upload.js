// api/upload.js
import formidable from "formidable";
import fs from "fs/promises";

/**
 * Vercel: disable automatic body parsing
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

const DROPBOX_API_CONTENT = "https://content.dropboxapi.com/2";
const DROPBOX_API = "https://api.dropboxapi.com/2";

/** helper: safe filename */
function safeFilename(name = "") {
  return name.replace(/\s+/g, "_").replace(/[^\w.\-()]/g, "");
}

/** helper: fetch JSON and throw on non-ok */
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    const json = JSON.parse(text || "{}");
    if (!res.ok) {
      const err = new Error("HTTP " + res.status);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } catch (e) {
    // if not JSON, still throw
    if (!res.ok) {
      const err = new Error("HTTP " + res.status + " - " + text);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    // otherwise return text (rare)
    return text;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
  if (!DROPBOX_TOKEN) {
    return res.status(500).json({ error: "Dropbox token not configured (env DROPBOX_TOKEN)" });
  }

  // parse multipart form with formidable
  const parsed = await new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false,
      // keep file extension and store in temp
      keepExtensions: true,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });

  try {
    const { fields, files } = parsed;
    const name = (fields.name || fields.nama || fields.username || "Anonim").toString();
    const comment = (fields.comment || fields.komentar || fields.text || "").toString();
    const rating = Number(fields.rating || 0);

    // Basic validation
    if (!name || !comment) {
      return res.status(400).json({ error: "Nama dan komentar harus diisi" });
    }
    if (!rating || rating < 1 || rating > 5) {
      // allow 0? but we require 1-5 in UI; so fallback 0 allowed
    }

    // We'll upload file if present
    let imageUrl = null;
    let imagePath = null;

    if (files && files.file) {
      const f = files.file;
      // some formidable versions return array for files.file if multiple; handle that
      const fileObj = Array.isArray(f) ? f[0] : f;

      // read file buffer
      const buffer = await fs.readFile(fileObj.filepath);
      const nameSafe = safeFilename(fileObj.originalFilename || fileObj.newFilename || "upload");
      imagePath = `/komentar-web/images/${Date.now()}_${nameSafe}`;

      // upload bytes to Dropbox (content API)
      const uploadRes = await fetch(`${DROPBOX_API_CONTENT}/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: imagePath,
            mode: "add",
            autorename: true,
            mute: false,
          }),
        },
        body: buffer,
      });

      if (!uploadRes.ok) {
        const body = await uploadRes.text();
        throw new Error(`Dropbox upload failed: ${uploadRes.status} ${body}`);
      }

      // get temporary link so browser can display image (valid for a short time)
      const tempJson = await fetchJson(`${DROPBOX_API}/files/get_temporary_link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: imagePath }),
      });

      // tempJson.link contains link like https://...
      imageUrl = tempJson.link || null;
    }

    // ---------- load existing comments.json ----------
    const commentsPath = "/komentar-web/comments.json";
    let comments = [];

    try {
      // download file content (content API files/download)
      const dlRes = await fetch(`${DROPBOX_API_CONTENT}/files/download`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DROPBOX_TOKEN}`,
          "Dropbox-API-Arg": JSON.stringify({ path: commentsPath }),
        },
      });

      if (dlRes.ok) {
        const txt = await dlRes.text();
        try {
          comments = JSON.parse(txt || "[]");
          if (!Array.isArray(comments)) comments = [];
        } catch (e) {
          // if parse error, fallback to empty array
          comments = [];
        }
      } else {
        // if not found (409), we'll create new
        const txt = await dlRes.text();
        // If it's not found, ignore. Otherwise log for debugging.
        // console.warn('Download comments.json failed:', dlRes.status, txt);
        comments = [];
      }
    } catch (e) {
      // network or other problems -> fallback to empty list
      comments = [];
    }

    // append new comment object
    const newComment = {
      name,
      comment,
      rating: Number.isFinite(rating) ? rating : 0,
      imageUrl: imageUrl || null,   // temporary link (usable directly)
      imagePath: imagePath || null, // path on dropbox for reference
      createdAt: new Date().toISOString()
    };

    comments.unshift(newComment); // newest first

    // upload back comments.json (overwrite)
    const commentsBuffer = Buffer.from(JSON.stringify(comments, null, 2), "utf8");
    const uploadCommentsRes = await fetch(`${DROPBOX_API_CONTENT}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: commentsPath,
          mode: "overwrite",
          autorename: false,
          mute: false,
        }),
      },
      body: commentsBuffer,
    });

    if (!uploadCommentsRes.ok) {
      const body = await uploadCommentsRes.text();
      throw new Error(`Failed to upload comments.json: ${uploadCommentsRes.status} ${body}`);
    }

    // success
    return res.status(200).json({ success: true, comment: newComment });
  } catch (err) {
    console.error("upload.js error:", err);
    return res.status(500).json({ error: err.message || "Server error", details: String(err) });
  }
}
