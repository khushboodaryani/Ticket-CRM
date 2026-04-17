// src/middlewares/upload.js
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = "public/attachments";
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        // Use a more robust unique identifier (uuid-like)
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `att-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
    },
});

const fileFilter = (req, file, cb) => {
    // Security: Only allow safe document and media types
    const allowedExtensions = /jpeg|jpg|png|gif|pdf|doc|docx|txt|xlsx|csv/;
    const allowedMimeTypes = [
        "image/jpeg", "image/png", "image/gif", "application/pdf",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv", "application/vnd.ms-excel"
    ];

    const isExtAllowed = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    const isMimeAllowed = allowedMimeTypes.includes(file.mimetype);

    if (isExtAllowed && isMimeAllowed) {
        cb(null, true);
    } else {
        cb(new Error("Security: File type not allowed. Restricted to Documents and Images."), false);
    }
};

export const upload = multer({ 
    storage, 
    fileFilter, 
    limits: { 
        fileSize: 10 * 1024 * 1024, // 10MB Limit as requested
        files: 5 // Max 5 files per upload
    } 
});
