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

// ---------------------------
// 3️⃣ Metadata
// ---------------------------
app.get("/api/metadata", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    carriers: [
      {
        carrier_id: "myrover",
        label: "MyRover Shipping",
        countries: ["CA"]
      }
    ]
  });
});

// ---------------------------
// 4️⃣ Rates
// ---------------------------
app.post("/api/rates", (req, res) => {
  res.setHeader("Content-Type", "application/json");

  res.status(200).json({
    quotes: [
      {
        carrier_id: "myrover",
        carrier_name: "MyRover Shipping",
        service_id: "standard",
        service_name: "Standard Delivery (3-5 days)",
        rate: 12.99,
        transit_time: "3-5 business days"
      },
      {
        carrier_id: "myrover",
        carrier_name: "MyRover Shipping",
        service_id: "express",
        service_name: "Express Delivery (1-2 days)",
        rate: 24.99,
        transit_time: "1-2 business days"
      }
    ]
  });
});

// ---------------------------
// 5️⃣ Start Server
// ---------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 MyRover Carrier running on port ${PORT}`));
