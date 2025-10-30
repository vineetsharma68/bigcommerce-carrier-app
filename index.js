// index.js
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";
import bodyParser from "body-parser";

dotenv.config();
const app = express();
app.use(bodyParser.json());

// 🗝️ In-memory token storage (replace with DB in production)
const storeTokens = new Map();

// BigCommerce OAuth setup
const CLIENT_ID = process.env.BC_CLIENT_ID;
const CLIENT_SECRET = process.env.BC_CLIENT_SECRET;
const REDIRECT_URI = process.env.BC_REDIRECT_URI; // https://your-app-url.onrender.com/api/auth/callback

// 🔹 Root endpoint
app.get("/", (req, res) => {
  res.send("🚀 MyRover Carrier App is running");
});

// 🔹 OAuth callback
app.get("/api/auth/callback", async (req, res) => {
  try {
    const { code, context } = req.query;
    const storeHash = context.split("/")[1];

    const tokenRes = await axios.post(
      `https://login.bigcommerce.com/oauth2/token`,
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        code,
        scope: "store_v2_information store_v2_shipping",
        context
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const accessToken = tokenRes.data.access_token;
    storeTokens.set(storeHash, accessToken);
    console.log(`✅ Access token stored for store: ${storeHash}`);

    res.send(
      `<h2>✅ MyRover Carrier App Installed Successfully for ${storeHash}</h2>`
    );
  } catch (error) {
    console.error("❌ Auth callback error:", error.response?.data || error.message);
    res.status(500).send("OAuth installation failed");
  }
});

// 🔹 App load (inside BigCommerce admin UI)
app.get("/api/load", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial; text-align:center; margin-top:50px;">
        <h1>🚚 MyRover Carrier Dashboard</h1>
        <p>Your app is successfully connected to BigCommerce.</p>
        <p>Use MyRover to get live delivery quotes in your checkout!</p>
      </body>
    </html>
  `);
});

// 🔹 Shipping Connection endpoint
app.get("/v1/shipping/connection", (req, res) => {
  console.log("🔗 Connection check received");
  res.status(200).json({
    success: true,
    message: "MyRover Carrier connected successfully",
  });
});

// 🔹 Shipping Rates endpoint
app.post("/v1/shipping/rates", async (req, res) => {
  try {
    console.log("📦 Rate request received:", JSON.stringify(req.body, null, 2));

    // Example static rate (you can replace with MyRover API call)
    const rates = [
      {
        carrier_id: "myrover_standard",
        carrier_name: "MyRover Express",
        description: "Standard Delivery (1–3 days)",
        price: 99.0,
        transit_time: "1-3 days",
        currency: "INR",
      },
      {
        carrier_id: "myrover_fast",
        carrier_name: "MyRover Express",
        description: "Express Delivery (Same Day)",
        price: 199.0,
        transit_time: "Same Day",
        currency: "INR",
      },
    ];

    res.status(200).json({ data: rates });
  } catch (error) {
    console.error("❌ Error generating rates:", error.message);
    res.status(500).json({ error: "Failed to get shipping rates" });
  }
});

// 🔹 Uninstall endpoint (optional cleanup)
app.post("/api/uninstall", (req, res) => {
  const storeHash = req.body.store_hash;
  storeTokens.delete(storeHash);
  console.log(`🗑️ Uninstalled from ${storeHash}`);
  res.status(200).json({ success: true });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MyRover Carrier running on port ${PORT}`));
