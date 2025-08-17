import { Dropbox } from "dropbox";
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, comment, rating, image } = req.body;

    if (!name || !comment) {
      return res.status(400).json({ error: "Nama dan komentar wajib diisi" });
    }

    // Ambil token dari environment variable di Vercel
    const dbx = new Dropbox({
      accessToken: process.env.DROPBOX_TOKEN,
      fetch,
    });

    // Data komentar
    const newComment = {
      name,
      comment,
      rating,
      image: image || null,
      date: new Date().toISOString(),
    };

    // Ambil file comments.json di Dropbox
    let comments = [];
    try {
      const response = await dbx.filesDownload({ path: "/komentar-web/comments.json" });
      const content = response.result.fileBinary.toString("utf-8");
      comments = JSON.parse(content);
    } catch (err) {
      console.log("Belum ada comments.json, akan dibuat baru.");
    }

    // Tambahkan komentar baru
    comments.push(newComment);

    // Upload balik ke Dropbox
    await dbx.filesUpload({
      path: "/komentar-web/comments.json",
      contents: JSON.stringify(comments, null, 2),
      mode: { ".tag": "overwrite" },
    });

    res.status(200).json({ success: true, message: "Komentar berhasil disimpan" });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Gagal menyimpan komentar", details: error.message });
  }
}
