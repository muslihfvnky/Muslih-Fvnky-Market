// api/upload.js
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

    // Ambil token dari environment variable
    const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
    if (!DROPBOX_TOKEN) {
      return res.status(500).json({ error: "Token Dropbox tidak ditemukan" });
    }

    const dbx = new Dropbox({ accessToken: DROPBOX_TOKEN, fetch });

    // Buat isi komentar
    const newComment = {
      name,
      comment,
      rating,
      image,
      date: new Date().toISOString(),
    };

    // Path file JSON komentar
    const filePath = "/komentar-web/comments.json";

    // Coba ambil file lama
    let comments = [];
    try {
      const response = await dbx.filesDownload({ path: filePath });
      const content = response.result.fileBinary.toString();
      comments = JSON.parse(content);
    } catch (err) {
      console.log("Belum ada file, buat baru.");
    }

    // Tambahkan komentar baru
    comments.push(newComment);

    // Upload balik ke Dropbox
    await dbx.filesUpload({
      path: filePath,
      mode: { ".tag": "overwrite" },
      contents: JSON.stringify(comments, null, 2),
    });

    return res.status(200).json({ success: true, message: "Komentar berhasil disimpan!" });
  } catch (error) {
    console.error("Error server:", error);
    return res.status(500).json({ error: "Terjadi kesalahan server" });
  }
}
