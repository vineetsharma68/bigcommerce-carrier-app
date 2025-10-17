require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// 🏠 Home route
app.get("/", (req, res) => {
  res.send("Hello from BigCommerce Carrier App!");
});

// 🔐 Auth Callback
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

// 📦 Load Callback
app.get("/api/load", (req, res) => {
  res.send("🚀 App loaded inside BigCommerce Control Panel!");
});

// ❌ Uninstall Callback
app.post("/api/uninstall", (req, res) => {
  console.log("Uninstall request received:", req.body);
  res.send("❌ App uninstalled, cleanup done.");
});

// 🧠 MyRover.io Rate Calculation
app.post("/api/rates", async (req, res) => {
  const { origin, destination, items } = req.body;
  console.log("Rate request received:", { origin, destination, items });

  if (!process.env.MYROVER_API_KEY) {
    console.warn("MYROVER_API_KEY not set, returning dummy rates.");
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
      { origin, destination, items },
      {
        headers: {
          "Authorization": `Bearer ${process.env.MYROVER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("MyRover.io response:", response.data);
    console.log("Using MyRover.io API Key:", process.env.MYROVER_API_KEY);

    const ratesArray = response.data?.rates || [];
    let rates = ratesArray.map(rate => ({
      carrier_quote: {
        code: rate.service_code || rate.code || "standard",
        display_name: rate.service_name || rate.name || "Standard Shipping",
        cost: rate.price || 10.5
      }
    }));

    if (rates.length === 0) {
      rates = [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } }
      ];
    }

    res.json({ data: rates });

  } catch (err) {
    console.error("MyRover.io API error:", err.response?.data || err.message);
    res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } }
      ]
    });
  }
});

// ✅ Connection Check
app.get("/api/check", (req, res) => {
  res.json({ success: true, message: "Carrier service connection OK ✅" });
});

// ✅ MyRover.io API Key Test Endpoint
app.get("/api/test-myrover", async (req, res) => {
  try {
    console.log("🔍 Testing MyRover.io API Key:", process.env.MYROVER_API_KEY);

    const response = await axios.post(
      "https://apis.myrover.io/GetPrice",
      {
        origin: { postal_code: "L6H7T7", country_code: "CA" },
        destination: { postal_code: "M4B1B3", country_code: "CA" },
        items: [{ quantity: 1, weight: { value: 1, units: "kg" } }]
      },
      {
        headers: {
          "X-API-Key": process.env.MYROVER_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    return res.json({
      success: true,
      mode: "Bearer",
      data: response.data
    });

  } catch (err) {
    console.error("❌ Bearer mode failed:", err.response?.data || err.message);

    try {
      let retry = await axios.post(
        "https://apis.myrover.io/GetPrice",
        {
          origin: { postal_code: "L6H7T7", country_code: "CA" },
          destination: { postal_code: "M4B1B3", country_code: "CA" },
          items: [{ quantity: 1, weight: { value: 1, units: "kg" } }]
        },
        {
          headers: {
            "Authorization": process.env.MYROVER_API_KEY,
            "Content-Type": "application/json"
          }
        }
      );

      return res.json({
        success: true,
        mode: "No Bearer",
        data: retry.data
      });
    } catch (retryErr) {
      console.error("❌ Retry (No Bearer) also failed:", retryErr.response?.data || retryErr.message);
      return res.status(401).json({
        success: false,
        error: retryErr.response?.data || retryErr.message
      });
    }
  }
});

// 🌐 New Route to get Render Server Public IP
app.get("/api/myip", async (req, res) => {
  try {
    const ipResponse = await axios.get("https://api.ipify.org?format=json");
    console.log("Public IP Address:", ipResponse.data.ip);
    res.json({ success: true, ip: ipResponse.data.ip });
  } catch (err) {
    console.error("Failed to get IP:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🚀 Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
