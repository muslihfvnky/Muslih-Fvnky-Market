// api/upload.js
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
};

function jsonResponse(res, status, payload) {
  res.setHeader("Content-Type", "application/json");
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
  if (!DROPBOX_TOKEN) {
    return jsonResponse(res, 500, { error: "DROPBOX_TOKEN is not set in environment" });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return jsonResponse(res, 500, { error: "Error parsing form" });
    }

    try {
      const name = fields.name || "Anon";
      const comment = fields.comment || "";
      const rating = fields.rating || 0;

      let fileUrl = null;

      if (files?.file) {
        const f = files.file;
        const buffer = fs.readFileSync(f.filepath);
        const dropPath = `/komentar-web/${Date.now()}_${f.originalFilename.replace(/\s+/g, "_")}`;

        // 1) upload file binary
        const upResp = await fetch("https://content.dropboxapi.com/2/files/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DROPBOX_TOKEN}`,
            "Dropbox-API-Arg": JSON.stringify({
              path: dropPath,
              mode: "add",
              autorename: true,
              mute: false,
            }),
            "Content-Type": "application/octet-stream",
          },
          body: buffer,
        });

        if (!upResp.ok) {
          const txt = await upResp.text();
          console.error("Dropbox upload error:", upResp.status, txt);
          return jsonResponse(res, 500, { error: "Failed to upload file to Dropbox", details: txt });
        }

        // 2) get temporary link
        const tempResp = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DROPBOX_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: dropPath }),
        });

        const tempJson = await tempResp.json();
        if (tempJson?.link) {
          fileUrl = tempJson.link;
        } else {
          console.warn("No temporary link returned", tempJson);
        }
      }

      // 3) read existing comments.json (jika ada)
      let comments = [];
      try {
        const dlResp = await fetch("https://content.dropboxapi.com/2/files/download", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DROPBOX_TOKEN}`,
            "Dropbox-API-Arg": JSON.stringify({ path: "/komentar-web/comments.json" }),
          },
        });

        if (dlResp.ok) {
          const ab = await dlResp.arrayBuffer();
          const str = Buffer.from(ab).toString("utf8");
          comments = JSON.parse(str);
          if (!Array.isArray(comments)) comments = [];
        } else {
          // jika file tidak ada, Dropbox biasanya kembalikan 409; cukup abaikan
          console.log("comments.json download status:", dlResp.status);
        }
      } catch (e) {
        console.log("No comments.json yet or parse failed:", e.message);
      }

      // 4) tambahkan komentar baru
      const newComment = {
        name,
        comment,
        rating,
        image: fileUrl,
        date: new Date().toISOString(),
      };
      comments.push(newComment);

      // 5) upload kembali comments.json (overwrite)
      const uploadCommentsResp = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DROPBOX_TOKEN}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: "/komentar-web/comments.json",
            mode: { ".tag": "overwrite" },
          }),
          "Content-Type": "application/octet-stream",
        },
        body: Buffer.from(JSON.stringify(comments, null, 2), "utf8"),
      });

      if (!uploadCommentsResp.ok) {
        const txt = await uploadCommentsResp.text();
        console.error("Failed to save comments.json:", uploadCommentsResp.status, txt);
        return jsonResponse(res, 500, { error: "Failed to save comments", details: txt });
      }

      return jsonResponse(res, 200, { success: true, comment: newComment });
    } catch (e) {
      console.error("Server error:", e);
      return jsonResponse(res, 500, { error: "Server error", details: e.message });
    }
  });
}
