// src/db/index.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

let pool;

const connectDB = () => {
    try {
        if (!pool) {
            pool = mysql.createPool({
                host: process.env.MYSQL_HOST,
                user: process.env.MYSQL_USER,
                password: process.env.MYSQL_PASSWORD,
                database: process.env.DB_NAME,
                port: process.env.MYSQL_PORT || 3306,
                connectionLimit: 50,
                waitForConnections: true,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10 * 60000,
            });
            console.log(`\n✅ MySQL pool created → DB: ${process.env.DB_NAME} | HOST: ${process.env.MYSQL_HOST}`);
        }
        return pool;
    } catch (error) {
        console.error("❌ MySQL pool creation FAILED:", error.message);
        throw error;
    }
};

export default connectDB;
