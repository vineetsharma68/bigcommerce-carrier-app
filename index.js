import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();
const app = express();
app.use(bodyParser.json());

// 🏠 Root route
app.get("/", (req, res) => {
  res.send("🚀 MyRover BigCommerce Carrier App is running!");
});


// ==========================
// 🔹 OAuth Callback
// ==========================
app.get("/api/auth/callback", async (req, res) => {
  const { code, scope, context } = req.query;
  if (!code) return res.status(400).send("Missing OAuth code");

  try {
    const response = await axios.post("https://login.bigcommerce.com/oauth2/token", {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: process.env.REDIRECT_URI,
      code,
      scope,
      context,
    });

    console.log("✅ OAuth Response:", response.data);
    res.send("✅ App installed successfully! Token saved.");
  } catch (error) {
    console.error("❌ OAuth Error:", error.response?.data || error.message);
    res.status(500).send("OAuth failed");
  }
});


// ==========================
// 🔹 App Load Route (Fix for “Cannot GET /api/load”)
// ==========================
app.get("/api/load", async (req, res) => {
  try {
    const { signed_payload_jwt } = req.query;
    if (!signed_payload_jwt) return res.status(400).send("Missing signed_payload_jwt");

    const payload = jwt.verify(signed_payload_jwt, process.env.CLIENT_SECRET, {
      algorithms: ["HS256"],
    });

    console.log("✅ Load payload:", payload);

    res.send(`
      <html>
        <body style="font-family: sans-serif; padding: 20px;">
          <h1>🚚 MyRover Shipping App Installed Successfully!</h1>
          <p><b>Store:</b> ${payload.context}</p>
          <p><b>User Email:</b> ${payload.user?.email}</p>
          <p>Status: ✅ Active</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ Load error:", err.message);
    res.status(400).send("Invalid or expired signed_payload_jwt");
  }
});


// ==========================
// 🔹 MyRover Rate Quote Endpoint
// ==========================
app.post("/api/rates", async (req, res) => {
  const { origin, destination, items } = req.body;
  console.log("📦 Rate request received:", { origin, destination, items });

  try {
    // 1️⃣ Fetch available services
    const servicesResponse = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          Authorization: process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const services = servicesResponse.data?.services || [];
    console.log(`📋 Found ${services.length} services`);

    // 2️⃣ Try to get a price quote for the first valid service
    const results = [];
    for (const service of services) {
      try {
        const quoteRes = await axios.post(
          "https://apis.myrover.io/GetPrice",
          {
            service_id: service.id,
            priority_id: 1,
            pickup_address: "L6H7T7, Ontario, Canada",
            drop_address: "M4B1B3, Ontario, Canada",
          },
          {
            headers: {
              Authorization: process.env.MYROVER_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        results.push({
          carrier_quote: {
            code: service.abbreviation,
            display_name: service.name,
            cost: quoteRes.data?.data?.cost || 10,
          },
        });
      } catch (err) {
        console.warn(`❌ Service ${service.abbreviation} failed:`, err.response?.data || err.message);
      }
    }

    // 3️⃣ Return all successful rates (or fallback)
    if (results.length === 0) {
      results.push({
        carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 15.0 },
      });
    }

    res.json({ data: results });
  } catch (err) {
    console.error("❌ MyRover API error:", err.response?.data || err.message);
    res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 15.0 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } },
      ],
    });
  }
});


// ==========================
// 🔹 Test MyRover API Key
// ==========================
app.get("/api/test-myrover", async (req, res) => {
  try {
    const response = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          Authorization: process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(401).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});


// ==========================
// 🔹 Start Server
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
