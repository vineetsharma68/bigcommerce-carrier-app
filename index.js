const express = require("express");
const app = express();

app.use(express.json());

// --- Debug Middleware: log every incoming request
app.use((req, res, next) => {
  console.log(`🔹 Incoming request: ${req.method} ${req.url}`);
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  next();
});

// --- Load callback
app.get("/api/load", (req, res) => {
  console.log("✅ /api/load HIT");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  res.status(200).send(JSON.stringify({
    data: {
      app_id: "myrover_carrier",
      name: "MyRover Shipping",
      regions: ["CA"],
      settings: {}
    }
  }));
});

// --- Check callback
app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  res.status(200).send(JSON.stringify({ data: { status: "active" } }));
});

// --- Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Debug MyRover Carrier running on port ${PORT}`));
