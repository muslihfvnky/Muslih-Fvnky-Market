// api/upload.js
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false, // wajib kalau pake formidable
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const form = new formidable.IncomingForm({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(500).json({ success: false, error: "Gagal mem-parse form" });
    }

    try {
      const nama = (fields.nama || "").toString();
      const komentar = (fields.komentar || "").toString();
      const rating = (fields.rating || "0").toString();

      let fileUrl = null;
      const token = process.env.DROPBOX_TOKEN; // <-- pastikan ini ada di Vercel env

      // jika ada file, upload ke Dropbox
      if (files?.file && files.file.filepath) {
        if (!token) {
          console.error("Dropbox token missing");
          return res.status(500).json({ success: false, error: "Dropbox token belum diset (DROPBOX_TOKEN)" });
        }

        const filepath = files.file.filepath;
        const originalName = files.file.originalFilename || "upload";
        const cleanName = originalName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9-_\.]/g, "");
        const dropboxPath = `/komentar-web/${Date.now()}_${cleanName}`;

        // baca file dari tmp
        const fileData = fs.readFileSync(filepath);

        // upload konten
        const uploadResp = await fetch("https://content.dropboxapi.com/2/files/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
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

        const uploadText = await uploadResp.text();
        // Dropbox bisa mengembalikan teks error, jadi parse aman:
        let uploadJson = null;
        try {
          uploadJson = JSON.parse(uploadText);
        } catch (e) {
          console.error("Dropbox upload returned non-JSON:", uploadText);
          // laporkan sebagai error yang jelas ke client
          return res.status(500).json({ success: false, error: "Dropbox upload error: " + uploadText.substring(0, 400) });
        }

        // dapatkan temporary link
        const linkResp = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: dropboxPath }),
        });

        const linkJson = await linkResp.json();
        if (linkJson && linkJson.link) {
          fileUrl = linkJson.link;
        } else {
          console.warn("No temporary link from Dropbox:", linkJson);
          fileUrl = null;
        }

        // hapus file tmp (optional)
        try { fs.unlinkSync(filepath); } catch (e) {}
      }

      // sukses
      return res.status(200).json({
        success: true,
        nama,
        komentar,
        rating,
        fileUrl,
      });
    } catch (e) {
      console.error("Server error:", e);
      return res.status(500).json({ success: false, error: e.message || "Server error" });
    }
  });
}
