import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();
const app = express();
app.use(express.json());

// 🔑 Environment Variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const APP_URL = process.env.APP_URL;
const MYROVER_API_KEY = process.env.MYROVER_API_KEY;
const PORT = process.env.PORT || 3000;

// 🧠 In-memory token store
const storeTokens = new Map();

/* -------------------------------------------
   STEP 1: INSTALL → OAUTH
--------------------------------------------*/
app.get("/install", (req, res) => {
  const { context, scope } = req.query;

  const redirect = `https://login.bigcommerce.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=${scope}&redirect_uri=${APP_URL}/oauth&response_type=code&context=${context}`;

  res.redirect(redirect);
});

app.get("/oauth", async (req, res) => {
  try {
    const { code, context, scope } = req.query;

    if (!code || !context) throw new Error("Missing code or context");

    const storeHash = context.replace("stores/", "");

    const response = await fetch("https://login.bigcommerce.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${APP_URL}/oauth`,
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

    // ✔️ Register metadata for BigCommerce
    await registerMetadata(storeHash, token);

    res.send(`<h2>✅ MyRover Installed Successfully!</h2>
              <p>Store: ${storeHash}</p>`);
  } catch (err) {
    console.error("❌ OAuth callback failed:", err);
    res.status(400).json({ error: "OAuth callback failed", details: err.message });
  }
});

/* -------------------------------------------
   STEP 2: CONNECTION TEST
--------------------------------------------*/
app.post("/v1/shipping/connection", (req, res) => {
  console.log("🔗 Connection Request:", req.body);

  const responseBody = JSON.stringify({
    data: {
      success: true,
      message: "MyRover Carrier connection successful",
      carrier_name: "MyRover Carrier",
    },
  });

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(responseBody),
    "Cache-Control": "no-store",
  });

  res.end(responseBody);
});

/* -------------------------------------------
   STEP 3: LIVE RATES
--------------------------------------------*/
app.post("/v1/shipping/rates", async (req, res) => {
  const { origin, destination } = req.body;

  console.log("📦 Rate request:", req.body);

  try {
    const servicesRes = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          Authorization: MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const services = servicesRes.data?.services || [];

    const pricePromises = services.map((service) =>
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
        .then((response) => {
          const cost = response.data?.data?.cost || 0;

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
        .catch(() => null)
    );

    const results = await Promise.all(pricePromises);
    const rates = results.filter((r) => r !== null);

    if (rates.length === 0) {
      return res.json({
        data: [
          { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
          { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } },
        ],
      });
    }

    res.json({ data: rates });
  } catch (err) {
    console.error("❌ Rate error:", err);

    res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } },
      ],
    });
  }
});

/* -------------------------------------------
   STEP 4: METADATA REGISTRATION
--------------------------------------------*/
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

  if (!response.ok) {
    console.log("❌ Metadata registration failed:", data);
  } else {
    console.log("✅ Metadata registered:", data);
  }
}

/* -------------------------------------------
   ADMIN APP LOAD SCREEN
--------------------------------------------*/
app.get("/load", (req, res) => {
  res.send(`
    <h1>🚚 MyRover Carrier Dashboard</h1>
    <p>Your app is successfully connected to BigCommerce.</p>
  `);
});

/* -------------------------------------------
   UNINSTALL CLEANUP
--------------------------------------------*/
app.post("/uninstall", (req, res) => {
  const storeHash = req.body.store_hash;
  storeTokens.delete(storeHash);
  console.log("🗑️ App uninstalled from:", storeHash);
  res.status(200).json({ success: true });
});

/* -------------------------------------------
   ROOT + HEALTH CHECK
--------------------------------------------*/
app.get("/", (req, res) => {
  res.send("🚀 MyRover Carrier API Running");
});

app.listen(PORT, () => console.log(`🚀 MyRover running on port ${PORT}`));
