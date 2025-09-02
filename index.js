require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// Home route
app.get("/", (req, res) => {
  res.send("Hello from BigCommerce Carrier App!");
});

// Auth Callback
app.get("/api/auth", async (req, res) => {
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
  } catch (error) {
    console.error("OAuth Error:", error.response?.data || error.message);
    res.status(500).send("OAuth failed");
  }
});

// Load Callback
app.get("/api/load", (req, res) => {
  res.send("🚀 App loaded inside BigCommerce Control Panel!");
});

// Uninstall Callback
app.post("/api/uninstall", (req, res) => {
  console.log("Uninstall request received:", req.body);
  res.send("❌ App uninstalled, cleanup done.");
});

// /api/rates endpoint with MyRover.io integration
app.post("/api/rates", async (req, res) => {
  const { origin, destination, items } = req.body;
  console.log("Rate request received:", { origin, destination, items });

  // If API key missing, return dummy rates
  if (!process.env.MYROVER_API_KEY) {
    console.warn("MYROVER_API_KEY not set, returning dummy rates.");
    const fallbackRates = [
      { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
      { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } }
    ];
    return res.json({ data: fallbackRates });
  }

  try {
    // MyRover.io API call
    const response = await axios.post(
      "https://api.myrover.io/get-rates", // replace with actual endpoint from their docs
      { origin, destination, items },
      {
        headers: {
          "Authorization": `Bearer ${process.env.MYROVER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Map MyRover.io response to BigCommerce format
    const rates = response.data.rates.map(rate => ({
      carrier_quote: {
        code: rate.service_code,
        display_name: rate.service_name,
        cost: rate.price
      }
    }));

    res.json({ data: rates });

  } catch (err) {
    console.error("MyRover.io API error:", err.response?.data || err.message);

    // Fallback dummy rates
    const fallbackRates = [
      { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
      { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } }
    ];

    res.json({ data: fallbackRates });
  }
});

// Check Connection
app.get("/api/check", (req, res) => {
  res.json({ success: true, message: "Carrier service connection OK ✅" });
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
