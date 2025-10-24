const express = require("express");
const app = express();

app.use(express.json());

// ---------------------------
// 1️⃣ Load Callback
// ---------------------------
app.get("/api/load", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // Exact BigCommerce 2025 spec
  res.status(200).end(JSON.stringify({
    data: {
      app_id: "myrover_carrier",       // Must match Developer Portal
      name: "MyRover Shipping",        // Must match app name
      regions: ["CA"],                 // Supported country
      settings: {}                     // Any settings required
    }
  }));
});

// ---------------------------
// 2️⃣ Account Status Check
// ---------------------------
app.post("/api/check", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  res.status(200).end(JSON.stringify({ data: { status: "active" } }));
});

// --------------------------
