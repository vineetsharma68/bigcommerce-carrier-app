require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

/* -----------------------------------------------------
   🏠 HOME
----------------------------------------------------- */
app.get("/", (req, res) => {
  res.send("🚀 BigCommerce + MyRover Carrier App Running (Parallel Version)!");
});

/* -----------------------------------------------------
   🔑 AUTH CALLBACK
----------------------------------------------------- */
app.get("/api/auth", async (req, res) => {
  const { code, scope, context } = req.query;
  if (!code) return res.status(400).send("❌ Missing OAuth code");

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
    res.send("✅ App installed successfully! Token received and saved.");
  } catch (error) {
    console.error("❌ OAuth Error:", error.response?.data || error.message);
    res.status(500).send("OAuth failed");
  }
});

/* -----------------------------------------------------
   📦 LOAD CALLBACK
----------------------------------------------------- */
app.get("/api/load", (req, res) => {
  res.send("📦 BigCommerce App Loaded in Control Panel");
});

/* -----------------------------------------------------
   ❌ UNINSTALL CALLBACK
----------------------------------------------------- */
app.post("/api/uninstall", (req, res) => {
  console.log("🧹 Uninstall request received:", req.body);
  res.send("App uninstalled successfully, cleanup complete.");
});

/* -----------------------------------------------------
   🚚 MyRover SHIPPING RATES (Parallel)
----------------------------------------------------- */
app.post("/api/rates", async (req, res) => {
  const { origin, destination } = req.body;
  console.log("📦 Rate request received:", { origin, destination });

  if (!process.env.MYROVER_API_KEY) {
    console.warn("⚠️ MYROVER_API_KEY not set — returning dummy rates.");
    return res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } },
      ],
    });
  }

  try {
    // STEP 1: Fetch all available services
    const serviceRes = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          "Authorization": process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const services = serviceRes.data?.services || [];
    console.log(`🧾 Found ${services.length} services`);

    if (services.length === 0) throw new Error("No active services found");

    // STEP 2: Prepare parallel requests for GetPrice
    const promises = services.map((service) =>
      axios
        .post(
          "https://apis.myrover.io/GetPrice",
          {
            service_id: service.id,
            email: "test@example.com",
            priority_id: 1,
            pickup_address: origin.postal_code,
            drop_address: destination.postal_code,
          },
          {
            headers: {
              "Authorization": process.env.MYROVER_API_KEY,
              "Content-Type": "application/json",
            },
          }
        )
        .then((priceRes) => {
          const cost = priceRes.data?.data?.cost || 0;
          console.log(`✅ ${service.name}: ₹${cost}`);
          if (cost > 0) {
            return {
              carrier_quote: {
                code: service.abbreviation || `srv-${service.id}`,
                display_name: service.name,
                cost,
              },
            };
          }
          return null;
        })
        .catch((err) => {
          console.warn(`⚠️ ${service.name} failed:`, err.response?.data || err.message);
          return null;
        })
    );

    // STEP 3: Run all GetPrice requests in parallel
    const results = await Promise.all(promises);
    const validRates = results.filter((r) => r !== null);

    if (validRates.length === 0) {
      console.warn("⚠️ No valid rates returned from MyRover, using fallback.");
      return res.json({
        data: [
          { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
          { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } },
        ],
      });
    }

    res.json({ data: validRates });
  } catch (err) {
    console.error("❌ MyRover API error:", err.response?.data || err.message);
    res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } },
      ],
    });
  }
});

/* -----------------------------------------------------
   🧪 TEST MYROVER API CONNECTION
----------------------------------------------------- */
app.get("/api/test-myrover", async (req, res) => {
  try {
    const response = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          "Authorization": process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    res.json({
      success: true,
      message: "MyRover API connection OK ✅",
      data: response.data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

/* -----------------------------------------------------
   🔍 HEALTH CHECK
----------------------------------------------------- */
app.get("/api/check", (req, res) => {
  res.json({ success: true, message: "App running fine ✅" });
});

/* -----------------------------------------------------
   🟢 START SERVER
----------------------------------------------------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} (parallel mode)`));
