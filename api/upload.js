// api/upload.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { fileName, fileContent } = req.body;

    if (!fileName || !fileContent) {
      return res.status(400).json({ error: "fileName dan fileContent wajib ada" });
    }

    // akses token dropbox kamu
    const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

    if (!DROPBOX_ACCESS_TOKEN) {
      return res.status(500).json({ error: "Dropbox Access Token belum di-set di Vercel Environment Variables" });
    }

    // Upload ke Dropbox
    const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: `/${fileName}`,
          mode: "add",
          autorename: true,
          mute: false
        }),
        "Content-Type": "application/octet-stream"
      },
      body: Buffer.from(fileContent, "base64")
    });

    const data = await response.json();

    if (response.ok) {
      res.status(200).json({ success: true, data });
    } else {
      res.status(500).json({ error: data.error_summary || "Gagal upload ke Dropbox" });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Terjadi kesalahan pada server" });
  }
}
