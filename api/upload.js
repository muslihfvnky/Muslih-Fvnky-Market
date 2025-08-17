import { Dropbox } from "dropbox";
import formidable from "formidable";
import fs from "fs";

// Biar Vercel tahu kalau kita mau handle form-data
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
      console.error("Formidable error:", err);
      return res.status(500).json({ error: "Error parsing file" });
    }

    const file = files.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      // Ambil token dari env
      const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });

      // Baca file upload
      const fileContent = fs.readFileSync(file.filepath);

      // Upload ke Dropbox (folder root)
      const response = await dbx.filesUpload({
        path: "/" + file.originalFilename,
        contents: fileContent,
        mode: { ".tag": "add" }, // biar ga overwrite
      });

      return res.status(200).json({
        message: "Upload success!",
        file: response.result,
      });
    } catch (uploadError) {
      console.error("Dropbox error:", uploadError);
      return res.status(500).json({ error: "Failed to upload to Dropbox" });
    }
  });
}
