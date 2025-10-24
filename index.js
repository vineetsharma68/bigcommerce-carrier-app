require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// ✅ 1️⃣ Home route
app.get("/", (req, res) => {
  res.send("🚀 MyRover Carrier App is running successfully!");
});


// ✅ 2️⃣ OAuth Step 1 - BigCommerce authorization
app.get("/api/auth", async (req, res) => {
  console.log("✅ OAuth Step 1 triggered", req.query);

  const { context } = req.query;
  if (!context) return res.status(400).send("❌ Missing store context");

  const redirectUri = `${process.env.APP_URL}/api/auth/callback`;

  // Redirect to BigCommerce OAuth login
  const installUrl = `https://login.bigcommerce.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&scope=${encodeURIComponent("store_v2_orders store_v2_information store_v2_shipping")}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&context=${context}`;

  res.redirect(installUrl);
});


// ✅ 3️⃣ OAuth Step 2 - Callback from BigCommerce
app.get("/api/auth/callback", async (req, res) => {
  console.log("✅ OAuth Callback triggered:", req.query);

  const { code, scope, context } = req.query;
  if (!code) return res.status(400).send("❌ Missing OAuth code");

  try {
    const tokenResponse = await axios.post("https://login.bigcommerce.com/oauth2/token", {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: `${process.env.APP_URL}/api/auth/callback`,
      grant_type: "authorization_code",
      code,
      scope,
      context,
    });

    console.log("✅ OAuth Token Received:", tokenResponse.data);
    res.send("✅ App installed successfully! You can close this window now.");
  } catch (err) {
    console.error("❌ OAuth Error:", err.response?.data || err.message);
    res.status(500).send("OAuth failed");
  }
});


// ✅ 4️⃣ Uninstall callback
app.post("/api/uninstall", (req, res) => {
  console.log("❌ App Uninstalled:", req.body);
  res.send("✅ Uninstall cleanup done.");
});


// ✅ 5️⃣ Fetch available MyRover services
app.get("/api/myrover/services", async (req, res) => {
  try {
    const response = await axios.post("https://apis.myrover.io/GetServices", {}, {
      headers: {
        Authorization: process.env.MYROVER_API_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log("📦 MyRover Services:", response.data);
    res.json({
      success: true,
      message: "Fetched available services from MyRover",
      data: response.data,
    });
  } catch (err) {
    console.error("❌ Error fetching MyRover services:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});


// ✅ 6️⃣ Shipping Rates endpoint
app.post("/api/rates", async (req, res) => {
  const { origin, destination, items } = req.body;
  console.log("📦 Rate request received:", { origin, destination, items });

  try {
    // Fetch MyRover services dynamically (to get service IDs)
    const serviceRes = await axios.post("https://apis.myrover.io/GetServices", {}, {
      headers: {
        Authorization: process.env.MYROVER_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const services = serviceRes.data?.services || [];
    console.log(`✅ Found ${services.length} MyRover services`);

    // Test only first available service for demo (you can extend this)
    const service = services[0];
    console.log("🧩 Using service:", service);

    // Fake pickup/drop addresses for test — later map them dynamically
    const pickupAddress = "100 Dundas St W, Toronto, ON";
    const dropAddress = "200 King St W, Toronto, ON";

    // MyRover GetPrice API call
    const priceRes = await axios.post(
      "https://apis.myrover.io/GetPrice",
      {
        service_id: service.id,
        priority_id: 1,
        pickup_address: pickupAddress,
        drop_address: dropAddress,
      },
      {
        headers: {
          Authorization: process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("💰 MyRover Price Response:", priceRes.data);

    const cost = priceRes.data?.data?.cost || 15.0;

    const rates = [
      {
        carrier_quote: {
          code: service.abbreviation || "myrover",
          display_name: service.name || "MyRover Shipping",
          cost: cost,
        },
      },
    ];

    res.json({ data: rates });
  } catch (err) {
    console.error("❌ MyRover API error:", err.response?.data || err.message);

    // fallback dummy rates
    res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } },
      ],
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


// ✅ 7️⃣ Health check route
app.get("/api/check", (req, res) => {
  res.json({ success: true, message: "Carrier App connection OK ✅" });
});


// ✅ 8️⃣ Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
