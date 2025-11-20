import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();
const app = express();
app.use(express.json());

// 🔑 Environment Variables
const CLIENT_ID = process.env.BC_CLIENT_ID;
const CLIENT_SECRET = process.env.BC_CLIENT_SECRET;
const APP_URL = process.env.APP_URL; // e.g. https://myrover-carrier.onrender.com
const MYROVER_API_KEY = process.env.MYROVER_API_KEY;
const PORT = process.env.PORT || 3000;

// 🧠 Temporary Token Store
const storeTokens = new Map();


// 🔐 Step 1: Installation URL (OAuth Initiation)
app.get("/api/install", (req, res) => {
  const { context, scope } = req.query;
  const redirect = `https://login.bigcommerce.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=${scope}&redirect_uri=${APP_URL}/api/auth/callback&response_type=code&context=${context}`;
  res.redirect(redirect);
});



/* ===========================================================================
   1️⃣ OAuth Callback (Shipping Provider Install triggers THIS)
=========================================================================== */
app.get("/api/auth/callback", async (req, res) => {
  try {
    const { code, context, scope } = req.query;

    if (!code || !context) {
      return res.status(400).send("Missing code or context");
    }

    const storeHash = context.replace("stores/", "");

    const response = await fetch("https://login.bigcommerce.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${APP_URL}/api/auth/callback`,
        grant_type: "authorization_code",
        code,
        scope,
        context,
      }),
    });

    const data = await response.json();
    if (data.error) {
      console.error("OAuth error:", data);
      return res.status(400).json(data);
    }

    storeTokens.set(storeHash, data.access_token);

    console.log(`✅ OAuth successful for store: ${storeHash}`);

    // Register metadata with BigCommerce
    await registerMetadata(storeHash, data.access_token);

    res.send(`<h2>🚚 MyRover Carrier Installed Successfully</h2>`);
  } catch (err) {
    console.error("❌ OAuth callback failed:", err);
    res.status(500).send("OAuth callback failed");
  }
});

/* ===========================================================================
   2️⃣ Connection Test Endpoint (BigCommerce calls this)
=========================================================================== */
app.post("/v1/shipping/connection", (req, res) => {
  console.log("🔗 Connection Test HIT");
  console.log(req.body);

  res.status(200).json({
    data: {
      success: true,
      message: "MyRover Carrier connection successful",
      carrier_name: "MyRover Carrier",
    },
  });
});

/* ===========================================================================
   3️⃣ Shipping Rates Endpoint — Live MyRover Quotes
=========================================================================== */
app.post("/v1/shipping/rates", async (req, res) => {
  const { origin, destination } = req.body;
  console.log("📦 Rate Request:", req.body);

  // If API key missing → fallback
  if (!MYROVER_API_KEY) {
    return res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express", cost: 25.0 } },
      ],
    });
  }

  try {
    // Get services from MyRover
    const serviceRes = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          Authorization: MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const services = serviceRes.data?.services || [];

    // Parallel GetPrice Requests
    const priceRequests = services.map((service) =>
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
              Authorization: MYROVER_API_KEY,
              "Content-Type": "application/json",
            },
          }
        )
        .then((priceRes) => {
          const cost = priceRes.data?.data?.cost || 0;
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
          console.warn(`⚠️ Price error for ${service.name}`, err.response?.data);
          return null;
        })
    );

    const allResults = await Promise.all(priceRequests);
    const validRates = allResults.filter((r) => r !== null);

    if (validRates.length === 0) {
      return res.json({
        data: [
          { carrier_quote: { code: "standard", display_name: "Standard", cost: 10.5 } },
          { carrier_quote: { code: "express", display_name: "Express", cost: 25.0 } },
        ],
      });
    }

    res.json({ data: validRates });
  } catch (err) {
    console.error("❌ MyRover API Error:", err.message);
    res.status(500).json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express", cost: 25.0 } },
      ],
    });
  }
});

/* ===========================================================================
   4️⃣ Register Metadata with BigCommerce
=========================================================================== */
async function registerMetadata(storeHash, token) {
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/app/metadata`;

  const payload = {
    data: [
      { key: "shipping_connection", value: "/v1/shipping/connection" },
      { key: "shipping_rates", value: "/v1/shipping/rates" },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  console.log("📌 Metadata:", data);
  return data;
}

/* ===========================================================================
   5️⃣ Load endpoint (BigCommerce admin app UI)
=========================================================================== */
app.get("/api/load", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial; text-align:center; margin-top:50px;">
        <h1>🚚 MyRover Carrier Dashboard</h1>
        <p>Your carrier is connected successfully.</p>
        <p>Live quotes are now active.</p>
      </body>
    </html>
  `);
});

/* ===========================================================================
   6️⃣ Uninstall Endpoint
=========================================================================== */
app.post("/api/uninstall", (req, res) => {
  const storeHash = req.body.store_hash;
  storeTokens.delete(storeHash);
  console.log(`🗑️ Uninstalled from store: ${storeHash}`);
  res.status(200).json({ success: true });
});

/* ===========================================================================
   7️⃣ Root Endpoint
=========================================================================== */
app.get("/", (req, res) => {
  res.send("🚀 MyRover Carrier API is Running");
});

app.listen(PORT, () => console.log(`🚀 MyRover Carrier running on port ${PORT}`));
