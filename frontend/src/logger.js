// src/logger.js
import winston from "winston";
import { createWriteStream } from "fs";
import { mkdirSync } from "fs";

mkdirSync("logs", { recursive: true });

export const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "logs/app.log", maxsize: 5 * 1024 * 1024, maxFiles: 3 }),
        new winston.transports.File({ filename: "logs/error.log", level: "error", maxsize: 5 * 1024 * 1024, maxFiles: 3 }),
    ],
});
