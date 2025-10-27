import express from "express";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 10000;
const BASE_URL = process.env.BASE_URL || "https://myrover-carrier.onrender.com";
const MY_CARRIER_ID = "myrover_shipping";
const MY_DISPLAY_NAME = "MyRover Shipping";

// 🟢 Root route
app.get("/", (req, res) => {
  res.status(200).send("✅ MyRover Carrier App is running");
});

// 🟣 Auth callback (BigCommerce → App)
app.get("/api/auth/callback", (req, res) => {
  console.log("✅ /api/auth/callback HIT");
  res.status(200).json({ message: "Auth callback received" });
});

// 🟣 Load callback (BigCommerce admin load)
app.get("/api/load", (req, res) => {
  console.log("✅ /api/load HIT");
  res.status(200).json({ message: "App loaded successfully" });
});

// 🟣 Uninstall callback
app.post("/api/uninstall", (req, res) => {
  console.log("✅ /api/uninstall HIT");
  res.status(200).json({ message: "App uninstalled successfully" });
});

// 🟣 Metadata endpoint (register carrier)
app.get("/api/metadata", (req, res) => {
  console.log("✅ /api/metadata HIT");

  res.status(200).json({
    data: {
      carriers: [
        {
          carrier_id: MY_CARRIER_ID,
          label: MY_DISPLAY_NAME,
          countries: ["CA"],
          settings_url: `${BASE_URL}/api/check`,
          rates_url: `${BASE_URL}/api/rates`
        }
      ]
    }
  });
});

// 🟣 Account status check (Configuration test)
app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT: Account Status Check");

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  const response = {
    data: {
      status: "OK",
      account_status: "active",
      message: "Connection verified successfully"
    }
  };

  console.log("Sending Response:", response);
  res.status(200).json(response);
});



// 🟣 Rates endpoint (for shipping quote calculation)
app.post("/api/rates", (req, res) => {
  console.log("✅ /api/rates HIT");

  const { origin, destination, packages } = req.body;
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));

  // Basic rate example (static for now)
  const response = {
    data: {
      rates: [
        {
          carrier_id: MY_CARRIER_ID,
          carrier_name: MY_DISPLAY_NAME,
          service_code: "MYROVER_EXPRESS",
          service_name: "MyRover Express",
          cost: 12.5,
          transit_time: "2-3 days",
          currency: "CAD"
        }
      ]
    }
  };

  res.status(200).json(response);
});

// 🟣 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
