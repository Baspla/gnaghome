// scripts/checkpoint.ts
import { Database, constants } from "bun:sqlite";

const db = new Database("data/sqlite.db");

try {
    
    const result = db.query("PRAGMA wal_checkpoint(TRUNCATE);").get();
    console.log("WAL Checkpoint TRUNCATE result:", result);
} catch (err) {
    console.error("Failed to checkpoint WAL:", err);
} finally {
    db.close(true);
    console.log("Database connection closed cleanly.");
}