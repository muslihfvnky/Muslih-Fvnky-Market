// /api/upload.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metode tidak diizinkan" });
  }

  try {
    const { name, comment, file } = req.body;

    if (!name || !comment || !file) {
      return res.status(400).json({ error: "Data tidak lengkap" });
    }

    const buffer = Buffer.from(file.split(",")[1], "base64");
    const dropboxToken = process.env.DROPBOX_ACCESS_TOKEN;

    if (!dropboxToken) {
      return res.status(500).json({ error: "Token Dropbox tidak ditemukan di ENV" });
    }

    // Simpan file ke Dropbox
    const dropboxRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${dropboxToken}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: `/komentar-web/${Date.now()}-${name}.jpg`,
          mode: "add",
          autorename: true,
          mute: false
        }),
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
    });

    const dropboxData = await dropboxRes.json();

    if (dropboxData.error) {
      return res.status(500).json({ error: "Upload Dropbox gagal", detail: dropboxData });
    }

    // Simpan komentar jadi file JSON juga
    const komentarData = {
      name,
      comment,
      filePath: dropboxData.path_display,
      createdAt: new Date().toISOString(),
    };

    await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${dropboxToken}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: `/komentar-web/${Date.now()}-komentar.json`,
          mode: "add",
          autorename: true,
          mute: false
        }),
        "Content-Type": "application/octet-stream",
      },
      body: Buffer.from(JSON.stringify(komentarData)),
    });

    res.status(200).json({ success: true, message: "Komentar berhasil disimpan!" });

  } catch (err) {
    res.status(500).json({ error: "Server error", detail: err.message });
  }
}
