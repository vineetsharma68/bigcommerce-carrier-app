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

// Register hook for automatic shipping quote callbacks
await registerShippingHook(storeHash, token);

    await registerMetadata(storeHash, token);
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
//app.post("/v1/shipping/rates", async (req, res) => {
app.post("/v1/shipping/rates", async (req, res) => {
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

/* -------------------------------------------------------------------------- */
/*  STEP 4️⃣ Register Metadata with BigCommerce                                */
/* -------------------------------------------------------------------------- */
async function registerMetadata(storeHash, token) {
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/app/metadata`;
  const payload = {
    data: [
      { key: "shipping_connection", value: "/v1/shipping/connection" },
      { key: "shipping_rates", value: "/v1/shipping/rates" }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    console.warn("⚠️ Could not parse metadata response body");
  }

  if (!response.ok) {
    console.error(`❌ Metadata registration failed: ${response.status}`, data);
    return data;
  }

  console.log("✅ Metadata registered successfully:", data);
  return data;
}

// 🧩 Debug Route — Test Stored Token
app.get("/debug/test", (req, res) => {
  const storeHash = req.query.store;
  const token = storeTokens.get(storeHash);
  if (!token) return res.json({ error: "No token or store hash loaded in memory" });
  res.json({ success: true, store: storeHash, token });
});


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




app.get("/debug/test", (req, res) => {
  const storeHash = req.query.store;
  const token = storeTokens.get(storeHash);
  if (!token) return res.json({ error: "No token for this store" });
  res.json({ success: true, store: storeHash, token });
});


// 🪝 Register Shipping Rate Hook with BigCommerce
async function registerShippingHook(storeHash, token) {
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v2/hooks`;

  const payload = {
    scope: "store/shipping/rate/quote",
    destination: "https://myrover-carrier.onrender.com/v1/shipping/rates",
    is_active: true,
  };

  console.log("📦 Registering shipping quote hook:", JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`❌ Hook registration failed: ${response.status}`, data);
  } else {
    console.log("✅ Hook registered successfully:", data);
  }

  return data;
}



app.listen(PORT, () => {
  console.log(`🚀 MyRover Carrier running on port ${PORT}`);
});
