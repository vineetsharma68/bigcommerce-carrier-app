import express from "express";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- Utility: simple log writer ---
function logToFile(filename, data) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(
    filename,
    `[${timestamp}] ${JSON.stringify(data, null, 2)}\n\n`
  );
}

// --- Root health check ---
app.get("/", (req, res) => {
  res.send("✅ MyRover Carrier App is Running (Debug Mode Enabled)");
});

// --- OAuth callback placeholder ---
app.get("/api/auth/callback", (req, res) => {
  console.log("🔐 Auth Callback hit:", req.query);
  logToFile("logs/auth_callback.log", { query: req.query });
  res.json({ success: true });
});

// --- Load / Uninstall ---
app.get("/api/load", (req, res) => {
  console.log("🟢 App Loaded");
  res.send("App Loaded");
});
app.get("/api/uninstall", (req, res) => {
  console.log("🔴 App Uninstalled");
  res.send("App Uninstalled");
});

// --- REQUIRED ENDPOINTS ---

// ✅ 1️⃣ Validate Connection (Test Connection)
app.post("/v1/shipping/connection", (req, res) => {
  console.log("✅ /v1/shipping/connection HIT from BigCommerce");

  // Log full request for debug
  logToFile("logs/connection.log", {
    headers: req.headers,
    body: req.body,
  });

  // Respond in correct REST Contract format
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
  logToFile("logs/rates.log", {
    headers: req.headers,
    body: req.body,
  });

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

// --- Debug route to check uptime ---
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
