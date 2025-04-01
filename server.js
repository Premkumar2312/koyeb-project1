const express = require("express");
const mysql = require("mysql");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Cloudinary Config
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET
});

// ✅ Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: { folder: "resumes", resource_type: "auto",type:"upload" }
});
const upload = multer({ storage });

// ✅ MySQL Connection (AlwaysData)
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

db.connect((err) => {
    if (err) console.error("Database connection failed:", err);
    else console.log("✅ Connected to MySQL on AlwaysData");
});

// ✅ Function to check if PDF contains keywords
const containsKeywords = (text, keywords) => {
    return keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
};

// ✅ Upload API - Filters PDFs based on keywords
app.post("/upload", upload.array("resumes"), async (req, res) => {
    try {
        const keywords = req.body.keywords;
        if (!keywords || keywords.trim() === "") return res.status(400).json({ error: "No keywords provided" });

        const keywordList = keywords.split(",").map(k => k.trim()).filter(k => k !== "");
        if (keywordList.length === 0) return res.status(400).json({ error: "Invalid keywords" });

        if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded" });

        // ✅ Clear previous resumes from the database
        db.query("TRUNCATE TABLE resumes", (err) => {
            if (err) console.error("Error truncating database:", err);
        });

        let insertedCount = 0;
        for (const file of req.files) {
            try {
                // ✅ Download file from Cloudinary
                const response = await axios.get(file.path, { responseType: "arraybuffer" });
                const pdfText = (await pdfParse(Buffer.from(response.data))).text;

                if (containsKeywords(pdfText, keywordList)) {
                    db.query("INSERT INTO resumes (filename, url) VALUES (?, ?)", [file.originalname, file.path]);
                    insertedCount++;
                }
            } catch (err) {
                console.error(`Error processing ${file.originalname}:`, err);
            }
        }

        res.json({ message: `✅ ${insertedCount} matching resumes uploaded!` });
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Error processing PDFs" });
    }
});

// ✅ Fetch API - Get stored resumes
app.get("/resumes", (req, res) => {
    db.query("SELECT id, filename, url FROM resumes", (err, results) => {
        if (err) {
            console.error("Error fetching resumes:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

// ✅ Start Server (Local + Koyeb)
const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});