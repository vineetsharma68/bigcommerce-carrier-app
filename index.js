import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- Ensure /logs directory exists ---
const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
  console.log("🪵 Created logs directory");
}

// --- Utility: simple log writer ---
function logToFile(filename, data) {
  const filePath = path.join(LOG_DIR, filename);
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${JSON.stringify(data, null, 2)}\n\n`;
  fs.appendFileSync(filePath, entry);
}

// --- Root health check ---
app.get("/", (req, res) => {
  res.send("✅ MyRover Carrier App is Running (Debug Mode Enabled)");
});

// --- OAuth callback ---
app.get("/api/auth/callback", (req, res) => {
  console.log("🔐 Auth Callback hit:", req.query);
  logToFile("auth_callback.log", { query: req.query });
  res.json({ success: true });
});

// --- Load / Uninstall handlers ---
app.get("/api/load", (req, res) => {
  console.log("🟢 App Loaded");
  res.send("App Loaded");
});

app.get("/api/uninstall", (req, res) => {
  console.log("🔴 App Uninstalled");
  res.send("App Uninstalled");
});

// ✅ 1️⃣ Validate Connection (Test Connection)
app.post("/v1/shipping/connection", (req, res) => {
  console.log("✅ /v1/shipping/connection HIT from BigCommerce");
  logToFile("connection.log", { headers: req.headers, body: req.body });

  res.status(200).json({
    valid: true,
    messages: [
      {
        code: "SUCCESS",
        text: "Connection successful. MyRover account verified.",
      },
    ],
  });
});

// ✅ 2️⃣ Return Shipping Rates
app.post("/v1/shipping/rates", (req, res) => {
  console.log("📦 /v1/shipping/rates HIT from BigCommerce");
  logToFile("rates.log", { headers: req.headers, body: req.body });

  const ratesResponse = {
    data: [
      {
        carrier_id: 530,
        carrier_code: "myrover",
        carrier_name: "MyRover Express",
        rate_id: "MYROVER_STANDARD",
        rate_name: "MyRover Delivery (1–2 Days)",
        cost: 9.99,
        currency: "CAD",
        transit_time: "1–2 business days",
        description: "Fast local delivery via MyRover",
      },
    ],
    valid: true,
    messages: [],
  };

  res.status(200).json(ratesResponse);
});

// --- Debug route to verify uptime ---
app.get("/debug/test", (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 MyRover Carrier running on port ${PORT}`);
});
