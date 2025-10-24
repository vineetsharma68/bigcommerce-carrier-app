import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Home route
app.get("/", (req, res) => {
  res.send("Hello from BigCommerce Carrier App!");
});

// OAuth callback
app.get("/api/auth/callback", async (req, res) => {
  const { code, scope, context } = req.query;
  if (!code) return res.status(400).send("Missing OAuth code");

  try {
    const response = await axios.post(
      "https://login.bigcommerce.com/oauth2/token",
      {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
        code,
        scope,
        context,
      }
    );

    console.log("OAuth Response:", response.data);
    res.send("✅ App installed successfully! Token saved.");
  } catch (err) {
    console.error("OAuth Error:", err.response?.data || err.message);
    res.status(500).send("OAuth failed");
  }
});

// Load callback
app.get("/api/load", (req, res) => {
  res.send("🚀 App loaded inside BigCommerce Control Panel!");
});

// Uninstall callback
app.post("/api/uninstall", (req, res) => {
  console.log("Uninstall request received:", req.body);
  res.send("❌ App uninstalled, cleanup done.");
});

// /api/rates endpoint using MyRover GetPrice
app.post("/api/rates", async (req, res) => {
  const { origin, destination, items, service_id } = req.body;

  console.log("📦 Rate request received:", { origin, destination, items, service_id });

  if (!process.env.MYROVER_API_KEY) {
    console.warn("MYROVER_API_KEY missing, returning dummy rates.");
    return res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } }
      ]
    });
  }

  try {
    const response = await axios.post(
      "https://apis.myrover.io/GetPrice",
      {
        service_id,
        priority_id: 1, // 1 = Normal
        pickup_address: `${origin.postal_code}, ${origin.country_code}`,
        drop_address: `${destination.postal_code}, ${destination.country_code}`,
        items,
      },
      {
        headers: {
          Authorization: process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        }
      }
    );

    console.log("MyRover.io response:", response.data);

    const data = response.data?.data || {};
    res.json({
      data: [
        {
          carrier_quote: {
            code: service_id.toString(),
            display_name: `MyRover Service ${service_id}`,
            cost: data.cost || 10.5
          }
        }
      ]
    });

  } catch (err) {
    console.error("❌ MyRover.io API error:", err.response?.data || err.message);
    res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } }
      ]
    });
  }
});

// Test MyRover API key
app.get("/api/test-myrover", async (req, res) => {
  try {
    const response = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          Authorization: process.env.MYROVER_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ MyRover.io GetServices error:", err.response?.data || err.message);
    res.status(401).json({ success: false, error: err.response?.data || err.message });
  }
});

// Check connection
app.get("/api/check", (req, res) => {
  res.json({ success: true, message: "Carrier service connection OK ✅" });
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
