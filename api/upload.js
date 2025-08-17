// api/upload.js
import { Dropbox } from "dropbox";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, comment } = req.body;

    if (!name || !comment) {
      return res.status(400).json({ error: "Name and comment are required" });
    }

    // isi file yang akan disimpan ke Dropbox
    const content = `Nama: ${name}\nKomentar: ${comment}\nTanggal: ${new Date().toISOString()}\n\n`;

    const dbx = new Dropbox({ accessToken: process.env.DROPBOX_TOKEN });

    await dbx.filesUpload({
      path: `/komentar-web/comments-${Date.now()}.txt`,
      contents: content,
      mode: "add",
      autorename: true,
      mute: false,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Upload failed", details: error });
  }
}
