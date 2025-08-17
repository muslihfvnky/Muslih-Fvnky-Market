import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

// Jangan taruh token langsung di code, lebih aman simpan di Environment Variable di Vercel
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const DROPBOX_FOLDER = "/komentar-web"; // folder target di Dropbox

export const config = {
  api: {
    bodyParser: false, // supaya bisa handle file upload
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error parsing form" });
    }

    try {
      const { nama, komentar, rating } = fields;
      const file = files.file;

      let fileUrl = null;

      if (file) {
        const fileData = fs.readFileSync(file.filepath);
        const dropboxPath = `${DROPBOX_FOLDER}/${Date.now()}_${file.originalFilename}`;

        // Upload ke Dropbox
        await fetch("https://content.dropboxapi.com/2/files/upload", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
            "Dropbox-API-Arg": JSON.stringify({
              path: dropboxPath,
              mode: "add",
              autorename: true,
              mute: false,
            }),
            "Content-Type": "application/octet-stream",
          },
          body: fileData,
        });

        // Generate temporary link supaya bisa diakses publik
        const resp = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: dropboxPath }),
        });
        const data = await resp.json();
        fileUrl = data.link;
      }

      // 👉 Simpan komentar ke Firebase Firestore (kalau mau, bisa juga simpan fileUrl)
      // Tapi kalau cuma upload Dropbox, cukup balikin hasilnya aja
      return res.status(200).json({
        success: true,
        nama,
        komentar,
        rating,
        fileUrl,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Gagal upload ke Dropbox" });
    }
  });
}
