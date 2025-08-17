import fetch from "node-fetch";

const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const DROPBOX_FOLDER = "/komentar-web";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { nama, komentar, rating, foto, waktu } = req.body;

    let fotoUrl = null;

    // === Upload Foto ke Dropbox ===
    if (foto) {
      const buffer = Buffer.from(foto.split(",")[1], "base64");
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const path = `${DROPBOX_FOLDER}/${filename}`;

      // Upload file
      await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: path,
            mode: "add",
            autorename: true,
            mute: false
          }),
          "Content-Type": "application/octet-stream"
        },
        body: buffer
      });

      // Buat shared link publik
      const sharedRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path })
      });

      const sharedData = await sharedRes.json();
      if (sharedData.url) {
        fotoUrl = sharedData.url.replace("?dl=0", "?raw=1"); // langsung tampil gambar
      }
    }

    // === Ambil comments.json lama ===
    let comments = [];
    try {
      const resp = await fetch("https://content.dropboxapi.com/2/files/download", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
          "Dropbox-API-Arg": JSON.stringify({ path: `${DROPBOX_FOLDER}/comments.json` })
        }
      });

      if (resp.ok) {
        const text = await resp.text();
        comments = JSON.parse(text);
      }
    } catch (err) {
      comments = [];
    }

    // === Tambah komentar baru ===
    const newComment = { nama, komentar, rating, foto: fotoUrl, waktu };
    comments.unshift(newComment);

    // === Upload ulang comments.json ===
    await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: `${DROPBOX_FOLDER}/comments.json`,
          mode: "overwrite"
        }),
        "Content-Type": "application/octet-stream"
      },
      body: Buffer.from(JSON.stringify(comments, null, 2))
    });

    res.status(200).json({ success: true, comment: newComment });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload gagal" });
  }
}
