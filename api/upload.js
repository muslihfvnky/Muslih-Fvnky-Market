import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: "Error parsing form" });
    }

    try {
      const { nama, komentar, rating } = fields;
      const file = files.file;
      let fileUrl = null;

      if (file) {
        const fileData = fs.readFileSync(file.filepath);
        const dropboxPath = `/komentar-web/${Date.now()}_${file.originalFilename}`;

        // Upload ke Dropbox
        await fetch("https://content.dropboxapi.com/2/files/upload", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.DROPBOX_ACCESS_TOKEN}`,
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

        // Generate temporary link
        const resp = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.DROPBOX_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: dropboxPath }),
        });
        const data = await resp.json();
        fileUrl = data.link;
      }

      res.status(200).json({
        success: true,
        nama,
        komentar,
        rating,
        fileUrl,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Upload gagal" });
    }
  });
}
