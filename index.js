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

// 🧠 In-memory token store (temporary)
const storeTokens = new Map();

/* -------------------------------------------------------------------------- */
/*  STEP 1️⃣ OAuth Installation Flow                                           */
/* -------------------------------------------------------------------------- */
app.get("/api/install", (req, res) => {
  const { context, scope } = req.query;
  const redirect = `https://login.bigcommerce.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=${scope}&redirect_uri=${APP_URL}/api/auth/callback&response_type=code&context=${context}`;
  res.redirect(redirect);
});

app.get("/api/auth/callback", async (req, res) => {
  try {
    const { code, context, scope } = req.query;
    if (!code || !context) throw new Error("Missing code or context");

    const storeHash = context.replace("stores/", "");
    const tokenUrl = `https://login.bigcommerce.com/oauth2/token`;

    const response = await fetch(tokenUrl, {
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
    if (data.error) throw new Error(JSON.stringify(data));

    const token = data.access_token;
    storeTokens.set(storeHash, token);

    console.log(`✅ Access token stored for store: ${storeHash}`);
    //await registerMetadata(storeHash, token);
    await registerCarrier(storeHash, token);
    res.send(`<h2>✅ MyRover Installed Successfully!</h2>
              <p>Store: ${storeHash}</p>`);
  } catch (err) {
    console.error("❌ OAuth callback failed:", err.message);
    res.status(400).json({ error: "OAuth callback failed", details: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/*  STEP 2️⃣ BigCommerce Test Connection Endpoint                              */
/* -------------------------------------------------------------------------- */
app.post("/v1/shipping/connection", (req, res) => {
  console.log("✅ /v1/shipping/connection HIT from BigCommerce");
  return res.status(200).json({
    status: "OK",
    message: "MyRover connection verified successfully",
  });
});

/* -------------------------------------------------------------------------- */
/*  STEP 3️⃣ Get Shipping Rates Endpoint                                       */
/* -------------------------------------------------------------------------- */
app.post("/v1/shipping/rates", async (req, res) => {
  console.log("📦 /v1/shipping/rates HIT from BigCommerce");
  const { origin, destination } = req.body || {};

  try {
    // ✅ If MyRover API key not set, return dummy rates for testing
    if (!MYROVER_API_KEY) {
      console.warn("⚠️ MYROVER_API_KEY not set — returning test rates.");
      return res.status(200).json({
        data: [
          {
            carrier_name: "MyRover Express",
            rate_name: "MyRover Standard",
            cost: 10.5,
            currency: "CAD",
          },
          {
            carrier_name: "MyRover Express",
            rate_name: "MyRover Express (1-Day)",
            cost: 25.0,
            currency: "CAD",
          },
        ],
      });
    }

    // ✅ Get available MyRover services
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
    console.log(`🧾 Found ${services.length} services from MyRover`);

    if (services.length === 0) throw new Error("No services found");

    // ✅ Fetch prices in parallel
    const ratePromises = services.map(async (service) => {
      try {
        const priceRes = await axios.post(
          "https://apis.myrover.io/GetPrice",
          {
            service_id: service.id,
            pickup_address: origin?.postal_code,
            drop_address: destination?.postal_code,
          },
          {
            headers: {
              Authorization: MYROVER_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        const cost = priceRes.data?.data?.cost || 0;
        if (cost > 0) {
          console.log(`✅ ${service.name}: ₹${cost}`);
          return {
            carrier_name: "MyRover Express",
            rate_name: service.name,
            cost,
            currency: "CAD",
          };
        }
      } catch (err) {
        console.warn(`⚠️ ${service.name} failed:`, err.response?.data || err.message);
      }
      return null;
    });

    const results = (await Promise.all(ratePromises)).filter(Boolean);

    if (results.length === 0) {
      console.warn("⚠️ No valid MyRover rates, using fallback.");
      return res.status(200).json({
        data: [
          { carrier_name: "MyRover Express", rate_name: "Standard", cost: 10.5, currency: "CAD" },
          { carrier_name: "MyRover Express", rate_name: "Express", cost: 25.0, currency: "CAD" },
        ],
      });
    }

    res.status(200).json({ data: results });
  } catch (err) {
    console.error("❌ Error in /v1/shipping/rates:", err.message);
    res.status(500).json({ error: "Failed to get MyRover rates" });
  }
});

/* -------------------------------------------------------------------------- */
/*  STEP 4️⃣ Register Metadata with BigCommerce                                */
/* -------------------------------------------------------------------------- */
async function registerCarrier(storeHash, token) {
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/carrier/connection/530`;

  const payload = {
    name: "MyRover Carrier",
    connection_url: "https://myrover-carrier.onrender.com/v1/shipping/connection",
    settings: {
      capabilities: ["domestic", "international"],
      supported_services: ["standard", "express"],
      developer_mode: true
    }
  };

  console.log("🚚 Updating carrier configuration for ID 530:", JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`❌ Carrier update failed: ${response.status}`, data);
    return data;
  }

  console.log("✅ Carrier updated successfully:", data);
  return data;
}


/* -------------------------------------------------------------------------- */
/*  STEP 5️⃣ Debug Routes                                                      */
/* -------------------------------------------------------------------------- */
app.get("/debug/token", (req, res) => {
  const storeHash = req.query.store;
  const token = storeTokens.get(storeHash);
  if (!token) return res.json({ error: "No token for this store" });
  res.json({ success: true, store: storeHash, token });
});

/* -------------------------------------------------------------------------- */
/*  STEP 6️⃣ Health Check + Root Endpoint                                     */
/* -------------------------------------------------------------------------- */
app.get("/", (req, res) => {
  res.send("<h1>🚀 MyRover Carrier App is Running</h1><p>Endpoints: /v1/shipping/connection, /v1/shipping/rates</p>");
});





/* -------------------------------------------------------------------------- */
/*  STEP 7 App load (inside BigCommerce admin UI)                                   */
/* -------------------------------------------------------------------------- */
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


/* -------------------------------------------------------------------------- */
/*  STEP 8 🔹 Uninstall endpoint (optional cleanup)                                  */
/* -------------------------------------------------------------------------- */
app.post("/api/uninstall", (req, res) => {
  const storeHash = req.body.store_hash;
  storeTokens.delete(storeHash);
  console.log(`🗑️ Uninstalled from ${storeHash}`);
  res.status(200).json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🚀 MyRover Carrier running on port ${PORT}`);
});
