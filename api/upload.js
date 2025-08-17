import { Dropbox } from "dropbox";
import formidable from "formidable";
import fs from "fs";

// pastikan body parser dimatikan karena kita pakai formidable
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
      console.error("Form parse error:", err);
      return res.status(500).json({ error: "Form parse error" });
    }

    try {
      const name = fields.name || "Anonim";
      const comment = fields.comment || "";
      const file = files.file;

      const dbx = new Dropbox({ accessToken: process.env.DROPBOX_TOKEN });

      // Simpan komentar ke file txt di Dropbox
      const textData = `Nama: ${name}\nKomentar: ${comment}\nTanggal: ${new Date().toISOString()}\n\n`;
      await dbx.filesUpload({
        path: `/komentar-web/${Date.now()}-comment.txt`,
        contents: textData,
      });

      // Kalau ada file gambar, upload juga
      if (file) {
        const fileStream = fs.readFileSync(file.filepath);
        await dbx.filesUpload({
          path: `/komentar-web/${Date.now()}-${file.originalFilename}`,
          contents: fileStream,
        });
      }

      return res.status(200).json({ success: true, message: "Komentar berhasil dikirim!" });
    } catch (uploadErr) {
      console.error("Upload error:", uploadErr);
      return res.status(500).json({ error: "Upload gagal" });
    }
  });
}
