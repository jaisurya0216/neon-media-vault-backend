require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json());

/* ─────────────────────────────
   ENV CHECK
───────────────────────────── */
console.log("ENV CHECK:", {
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  HAS_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY
});

/* ─────────────────────────────
   CLOUDINARY CONFIG
───────────────────────────── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ─────────────────────────────
   GOOGLE DRIVE AUTH
───────────────────────────── */
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

const drive = google.drive({ version: "v3", auth });

/* ─────────────────────────────
   GET FILES (FIXED)
───────────────────────────── */
app.get("/files", async (req, res) => {
  console.log("📂 /files hit");

  let cloudinaryFiles = [];
  let driveFiles = [];

  try {
    // 🔥 FIX: Cloudinary requires SEPARATE calls
    const images = await cloudinary.api.resources({
      resource_type: "image",
      max_results: 100,
    });

    const videos = await cloudinary.api.resources({
      resource_type: "video",
      max_results: 100,
    });

    cloudinaryFiles = [
      ...(images.resources || []),
      ...(videos.resources || [])
    ];
  } catch (e) {
    console.error("❌ Cloudinary error:", e.message);
  }

  try {
    const driveRes = await drive.files.list({
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents`,
      fields: "files(id,name,mimeType,thumbnailLink,webContentLink)",
    });
    driveFiles = driveRes.data.files || [];
  } catch (e) {
    console.error("❌ Drive error:", e.message);
  }

  res.json({
    cloudinary: cloudinaryFiles,
    drive: driveFiles,
  });
});

/* ─────────────────────────────
   CLOUDINARY UPLOAD
───────────────────────────── */
const upload = multer({ storage: multer.memoryStorage() });

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: "auto" },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    res.json(result);
  } catch (err) {
    console.error("❌ UPLOAD ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────
   START SERVER
───────────────────────────── */
app.listen(5000, () => {
  console.log("🚀 Backend running on http://localhost:5000");
});
