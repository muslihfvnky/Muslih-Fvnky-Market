// api/upload.js
const formidable = require('formidable');
const fs = require('fs');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // parse multipart form
  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error', err);
      res.status(500).json({ error: 'Form parse error', detail: err.message });
      return;
    }

    const name = fields.name || 'Anonymous';
    const commentText = fields.comment || '';
    const rating = Number(fields.rating || 0);

    const token = process.env.DROPBOX_TOKEN || process.env.DROPBOX_ACCESS_TOKEN;
    if (!token) {
      res.status(500).json({ error: 'Missing DROPBOX_TOKEN environment variable' });
      return;
    }

    let imagePublicUrl = null;

    try {
      // If a file was uploaded, upload it to Dropbox content endpoint
      if (files.file && files.file.path) {
        const file = files.file;
        const content = fs.readFileSync(file.path);
        const dropboxPath = `/comments/uploads/${Date.now()}_${file.name}`;

        const upRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath, mode: 'add', autorename: true, mute: false }),
            'Content-Type': 'application/octet-stream'
          },
          body: content
        });

        const upText = await upRes.text();
        // If Dropbox returns non-JSON, return as error
        let upJson;
        try { upJson = JSON.parse(upText); } catch(e) {
          console.error('Dropbox upload error:', upText);
          return res.status(500).json({ error: 'Dropbox upload error', detail: upText });
        }

        // create shared link so image can be accessed publicly (raw)
        const shareRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ path: dropboxPath, settings: { requested_visibility: 'public' } })
        });
        const shareText = await shareRes.text();
        let shareJson;
        try { shareJson = JSON.parse(shareText); } catch(e){
          // if already exists, try get metadata or accept returned text
          console.error('Dropbox share error', shareText);
          shareJson = null;
        }
        if (shareJson && shareJson.url) {
          // convert ?dl=0 -> ?raw=1 so it can be embedded
          imagePublicUrl = shareJson.url.replace('?dl=0','?raw=1');
        } else {
          // fallback: store path (not public)
          imagePublicUrl = null;
        }
      }

      // Download existing comments.json (if exists)
      let comments = [];
      const downloadRes = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: '/comments/comments.json' })
        }
      });

      if (downloadRes.ok) {
        const txt = await downloadRes.text();
        try {
          comments = JSON.parse(txt);
        } catch (e) {
          comments = [];
        }
      } else {
        // if not found, comments stays []
      }

      const newComment = {
        name,
        comment: commentText,
        rating,
        image: imagePublicUrl,
        created: new Date().toISOString()
      };

      comments.push(newComment);

      // Upload updated comments.json (overwrite)
      const uploadCommentsRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: '/comments/comments.json', mode: 'overwrite', autorename: false }),
          'Content-Type': 'application/octet-stream'
        },
        body: Buffer.from(JSON.stringify(comments, null, 2))
      });
      const finalTxt = await uploadCommentsRes.text();
      try { JSON.parse(finalTxt); } catch(e) { /* ignore */ }

      return res.status(200).json({ ok: true, comment: newComment, image: imagePublicUrl });
    } catch (err) {
      console.error('Server error', err);
      return res.status(500).json({ error: 'Server error', detail: String(err && err.message ? err.message : err) });
    }
  });
};
