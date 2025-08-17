// api/upload.js
import formidable from "formidable";
import { Dropbox } from "dropbox";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false, // karena pakai formidable
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
      const dropbox = new Dropbox({ accessToken: process.env.DROPBOX_TOKEN });

      let content;
      let filename;

      if (files.file) {
        content = fs.readFileSync(files.file[0].filepath);
        filename = files.file[0].originalFilename;
      } else {
        content = Buffer.from(fields.comment[0], "utf-8");
        filename = `comment-${Date.now()}.txt`;
      }

      await dropbox.filesUpload({
        path: `/komentar-web/${filename}`,
        contents: content,
        mode: "add",
        autorename: true,
      });

      return res.status(200).json({ success: true, message: "Upload berhasil!" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Gagal upload ke Dropbox" });
    }
  });
}
