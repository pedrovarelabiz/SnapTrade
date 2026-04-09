import express from "express";
import healthRoutes from "./src/routes/health.js";

const app = express();
const PORT = 3002;

// Set environment variable for backup directory
process.env.LOCAL_BACKUP_DIR = "/tmp/snaptrade-backups";

app.use(express.json());
app.use("/api/health", healthRoutes);

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test endpoint: http://localhost:3002/api/health/backup`);
});
