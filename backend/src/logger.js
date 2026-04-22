// src/logger.js
import winston from "winston";
import { createWriteStream } from "fs";
import { mkdirSync } from "fs";

mkdirSync("logs", { recursive: true });

winston.addColors({
    error: "red",
    warn: "yellow",
    info: "cyan",
    debug: "magenta"
});

const consoleFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
);

const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
);

export const logger = winston.createLogger({
    level: "info",
    transports: [
        new winston.transports.Console({ format: consoleFormat }),
        new winston.transports.File({ filename: "logs/app.log", format: fileFormat, maxsize: 5 * 1024 * 1024, maxFiles: 3 }),
        new winston.transports.File({ filename: "logs/error.log", level: "error", format: fileFormat, maxsize: 5 * 1024 * 1024, maxFiles: 3 }),
    ],
});
