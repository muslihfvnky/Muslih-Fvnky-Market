import { Dropbox } from "dropbox";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbx = new Dropbox({ accessToken: process.env.DROPBOX_TOKEN });

  try {
    const { name, comment } = req.body;

    // Ambil file lama
    let comments = [];
    try {
      const dl = await dbx.filesDownload({ path: "/komentar-web/comments.json" });
      const content = dl.result.fileBinary.toString();
      comments = JSON.parse(content);
    } catch {
      comments = [];
    }

    // Tambah komentar baru
    comments.push({
      name,
      comment,
      date: new Date().toISOString()
    });

    // Upload lagi ke Dropbox
    await dbx.filesUpload({
      path: "/komentar-web/comments.json",
      contents: JSON.stringify(comments, null, 2),
      mode: { ".tag": "overwrite" }
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan komentar" });
  }
}
