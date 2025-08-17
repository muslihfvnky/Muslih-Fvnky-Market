// api/upload.js
// Vercel Serverless (Node 18+) - handles GET (list comments) and POST (upload + append comment)
// Requires env var DROPBOX_TOKEN

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
const DROPBOX_UPLOAD_URL = "https://content.dropboxapi.com/2/files/upload";
const DROPBOX_DOWNLOAD_URL = "https://content.dropboxapi.com/2/files/download";
const DROPBOX_SHARE_URL = "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings";

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

async function bufferToUint8Array(buf) {
  return new Uint8Array(buf);
}

async function downloadCommentsFromDropbox() {
  try {
    const resp = await fetch(DROPBOX_DOWNLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        "Dropbox-API-Arg": JSON.stringify({ path: "/comments/comments.json" }),
      },
    });

    if (!resp.ok) {
      // file might not exist yet
      throw new Error(`not found`);
    }
    const text = await resp.text();
    return JSON.parse(text);
  } catch (err) {
    return []; // return empty list when not found or error
  }
}

async function uploadBytesToDropbox(path, bytes) {
  const resp = await fetch(DROPBOX_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DROPBOX_TOKEN}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode: "add",
        autorename: true,
        mute: false,
      }),
    },
    body: bytes,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Upload failed: ${resp.status} ${txt}`);
  }
  return await resp.json(); // metadata
}

async function overwriteBytesToDropbox(path, bytes) {
  // Overwrite mode for comments.json
  const resp = await fetch(DROPBOX_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DROPBOX_TOKEN}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode: "overwrite",
        autorename: false,
        mute: false,
      }),
    },
    body: bytes,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Overwrite failed: ${resp.status} ${txt}`);
  }
  return await resp.json();
}

async function createSharedLink(path) {
  try {
    const resp = await fetch(DROPBOX_SHARE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path, settings: { requested_visibility: "public" } }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      // If already exists, Dropbox returns error; try to extract url text anyway
      if (data && data.error && data.error.shared_link_already_exists && data.error.shared_link_already_exists.metadata && data.error.shared_link_already_exists.metadata.url) {
        return data.error.shared_link_already_exists.metadata.url;
      }
      throw new Error(JSON.stringify(data));
    }
    return data.url;
  } catch (err) {
    throw err;
  }
}

module.exports = async (req, res) => {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (!DROPBOX_TOKEN) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Server misconfigured: missing DROPBOX_TOKEN env var" }));
  }

  try {
    if (req.method === "GET") {
      // Return comments.json content (from Dropbox)
      const comments = await downloadCommentsFromDropbox();
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, comments }));
    }

    if (req.method === "POST") {
      // Collect body
      let body = "";
      for await (const chunk of req) body += chunk;
      if (!body) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Empty request body" }));
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch (err) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Invalid JSON" }));
      }

      const { name = "Anon", comment = "", rating = 0, filename = null, fileBase64 = null } = payload;
      const timestamp = new Date().toISOString();

      let photoUrl = null;

      // If fileBase64 sent, upload it to Dropbox
      if (fileBase64 && filename) {
        // fileBase64 might include data:...;base64,strip that
        const base64 = fileBase64.indexOf(",") >= 0 ? fileBase64.split(",")[1] : fileBase64;
        const buffer = Buffer.from(base64, "base64");
        const safePath = `/comments/${timestamp.replace(/[:.]/g, "-")}_${filename}`;

        // upload bytes to Dropbox
        await uploadBytesToDropbox(safePath, buffer);

        // create shared link
        let url;
        try {
          url = await createSharedLink(safePath);
        } catch (err) {
          // Try to ignore and continue (we can still serve via /2/files/get_temporary_link, but keep it simple)
          // Try get_temporary_link as fallback
          try {
            const tmpResp = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
              method: "POST",
              headers: { Authorization: `Bearer ${DROPBOX_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({ path: safePath }),
            });
            const tmpData = await tmpResp.json();
            if (tmpResp.ok && tmpData && tmpData.link) url = tmpData.link;
          } catch (er) {
            // ignore
          }
        }

        if (url) {
          // transform to raw image if possible
          if (url.includes("dl=0")) {
            photoUrl = url.replace("dl=0", "raw=1");
          } else if (url.includes("dl=1")) {
            // already direct
            photoUrl = url;
          } else {
            // add raw=1
            photoUrl = url + (url.includes("?") ? "&raw=1" : "?raw=1");
          }
        }
      }

      // Load current comments (from Dropbox)
      const comments = await downloadCommentsFromDropbox();

      // Append new comment
      const newComment = {
        name,
        comment,
        rating: Number(rating) || 0,
        photo: photoUrl,
        timestamp,
      };
      comments.unshift(newComment); // newest first

      // Save updated comments.json to Dropbox (overwrite)
      await overwriteBytesToDropbox("/comments/comments.json", Buffer.from(JSON.stringify(comments, null, 2)));

      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, comment: newComment }));
    }

    // Method not allowed
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (err) {
    console.error("API error:", err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Server error", details: String(err && err.message ? err.message : err) }));
  }
};
