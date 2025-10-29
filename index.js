// index.js (ESM)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ---------- CONFIG ----------
const BC_CLIENT_ID = process.env.BC_CLIENT_ID;
const BC_CLIENT_SECRET = process.env.BC_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || "https://myrover-carrier.onrender.com";
const PORT = process.env.PORT || 10000;

// In-memory store for testing (use DB in production)
const storeTokens = new Map(); // key: storeHash, value: access_token

// ---------- HELPERS ----------
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function exchangeCodeForToken(code, context, scope) {
  const tokenUrl = "https://login.bigcommerce.com/oauth2/token";
  const body = {
    client_id: BC_CLIENT_ID,
    client_secret: BC_CLIENT_SECRET,
    redirect_uri: `${APP_URL}/api/auth/callback`,
    grant_type: "authorization_code",
    code,
    scope,
    context,
  };

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

async function registerMetadataToStore(storeHash, token) {
  // BigCommerce expects an array of metadata objects or v3 structure.
  // We'll push a simple app metadata array that indicates carrier endpoints and configuration schema.
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/app/metadata`;

  // Example metadata: can be adjusted if BC expects different shape for your environment
  const metadata = [
    { key: "shipping_connection", value: "/v1/shipping/connection" },
    { key: "shipping_rates", value: "/v1/shipping/rates" },
    // You can add more keys or structured JSON strings if required
  ];

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Auth-Token": token,
    },
    body: JSON.stringify(metadata),
  });

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    const text = await resp.text();
    data = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, data };
}

// ---------- ROUTES ----------

// Health
app.get("/", (req, res) => {
  res.send("🚚 MyRover Carrier App - running");
});

// OAuth install starter (optional if you rely on BigCommerce install link)
app.get("/api/install", (req, res) => {
  // If BigCommerce calls with context & code, redirect to callback; else redirect to login authorize page
  const { context, scope, code } = req.query;
  if (code && context) {
    return res.redirect(`/api/auth/callback?code=${code}&context=${context}&scope=${scope || ""}`);
  }
  const scopes = encodeURIComponent("store_v2_default store_v2_information store_v2_orders");
  const redirect = `https://login.bigcommerce.com/oauth2/authorize?client_id=${BC_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(
    `${APP_URL}/api/auth/callback`
  )}&response_type=code`;
  res.redirect(redirect);
});

// OAuth callback - exchange code -> token
app.get("/api/auth/callback", async (req, res) => {
  try {
    const { code, context, scope } = req.query;
    if (!code || !context) {
      log("Missing code/context in auth callback", req.query);
      return res.status(400).send("Missing code or context");
    }

    log("Auth callback for store:", context);
    const { ok, status, data } = await exchangeCodeForToken(code, context, scope);

    if (!ok) {
      log("Token exchange failed:", status, data);
      return res.status(400).json({ error: "Token exchange failed", details: data });
    }

    const access_token = data.access_token;
    const storeHash = (data.context || context).replace("stores/", "");
    if (!access_token || !storeHash) {
      log("Invalid token response:", data);
      return res.status(400).json({ error: "Invalid token response", details: data });
    }

    // Save in-memory (for testing)
    storeTokens.set(storeHash, access_token);
    log(`✅ Stored access token for store: ${storeHash}`);

    // Try to register metadata automatically (best-effort)
    try {
      const metaRes = await registerMetadataToStore(storeHash, access_token);
      log("Metadata registration attempt:", metaRes.status, metaRes.data);
    } catch (e) {
      log("Metadata registration error:", e.message || e);
    }

    res.send(`<h2>✅ MyRover installed for store ${storeHash}</h2><p>You can close this window.</p>`);
  } catch (err) {
    log("OAuth callback error:", err);
    res.status(500).json({ error: "OAuth callback failed", message: err.message });
  }
});

// API check - called by BigCommerce app UI in some flows
app.post("/api/check", (req, res) => {
  log("/api/check HIT from BigCommerce headers:", req.headers["user-agent"]);
  // Respond with simple success structure
  return res.status(200).json({
    status: "OK",
    data: {
      can_connect: true,
      connected: true,
      account_status: "active",
      message: "Connection verified successfully",
    },
    messages: [{ code: "SUCCESS", text: "Connection successful. MyRover verified." }],
  });
});

// v1 metadata endpoint - what BigCommerce calls to learn what to show in UI
app.get("/v1/metadata", (req, res) => {
  log("/v1/metadata HIT");
  const metadata = {
    success: true,
    result: {
      data: {
        carriers: [
          {
            carrier_id: "myrover",
            carrier_name: "MyRover Express",
            carrier_code: "myrover",
            description: "MyRover Real-Time Shipping for BigCommerce",
            // connection_configurations will be shown on "Configure" form
            connection_configurations: [
              {
                code: "api_token",
                type: "password",
                label: "API Token",
                description: "API token to access MyRover",
                required: true,
              },
              {
                code: "account_key",
                type: "text",
                label: "Account Key",
                description: "Your MyRover account key",
                required: true,
              },
              {
                code: "use_sandbox",
                type: "checkbox",
                label: "Sandbox Mode",
                description: "Enable sandbox mode for testing",
                required: false,
              },
            ],
            settings_configurations: [
              {
                code: "destination_type",
                type: "select",
                label: "Destination Type",
                description: "Residential or commercial",
                required: false,
                map: { residential: "Residential", commercial: "Commercial" },
              },
              {
                code: "delivery_services",
                type: "multiselect",
                label: "Delivery Services",
                description: "Delivery service options to show to merchant",
                required: true,
                map: {
                  "1_day_air": "1 Day Air",
                  "2_day_air": "2 Day Air",
                  "1_day_ground": "1 Day Ground",
                  "2_day_ground": "2 Day Ground",
                },
              },
            ],
          },
        ],
      },
    },
  };

  return res.status(200).json(metadata);
});

// v1 shipping connection - BigCommerce calls this when merchant presses Save/Connect
app.post("/v1/shipping/connection", (req, res) => {
  log("✅ /v1/shipping/connection HIT from BigCommerce");
  log("Headers:", JSON.stringify(req.headers));
  log("Body:", JSON.stringify(req.body));

  // BigCommerce sends the connection configuration (merchant inputs) in body.
  // Accept flexible shapes: either req.body.connection_options or direct keys.
  const body = req.body || {};
  const connectionOptions = body.connection_options || body; // support both shapes

  // Validate required keys if you defined them in metadata
  const api_token = connectionOptions.api_token || connectionOptions.apiToken || connectionOptions.apiToken;
  const account_key = connectionOptions.account_key || connectionOptions.accountKey || connectionOptions.account_key;

  if (!api_token || !account_key) {
    // BigCommerce expects 200 with JSON, but we can return 400 so UI shows error message.
    log("Missing required connection params:", { api_token: !!api_token, account_key: !!account_key });
    return res.status(400).json({
      status: "FAIL",
      data: { can_connect: false },
      messages: [{ code: "MISSING_CONFIG", text: "Missing required API Token or Account Key" }],
    });
  }

  // Optionally test the token against MyRover API here. For now, reply with OK.
  return res.status(200).json({
    status: "OK",
    message: "Connection verified successfully",
    data: {
      account_status: "active",
      connected: true,
    },
  });
});

// v1 shipping rates - receives checkout/cart and returns rate objects
app.post("/v1/shipping/rates", (req, res) => {
  log("📦 /v1/shipping/rates HIT from BigCommerce");
  log("Body:", JSON.stringify(req.body));

  // Build rates based on request - simple static example below:
  const rates = [
    {
      carrier_id: 530, // BigCommerce numeric carrier id if used; keep consistent
      carrier_code: "myrover",
      carrier_name: "MyRover Express",
      rate_id: "MYROVER_STANDARD",
      rate_name: "MyRover Delivery (1–2 Days)",
      cost: 9.99,
      currency: "CAD",
      transit_time: "1–2 business days",
      description: "Fast local delivery via MyRover",
    },
  ];

  return res.status(200).json({ data: rates });
});

// Debug: force register metadata to store via API (accept query: store & token)
app.get("/debug/set-metadata", async (req, res) => {
  try {
    const store = req.query.store;
    const token = req.query.token;
    if (!store || !token) {
      return res.status(400).json({ error: "Provide ?store={storeHash}&token={storeAccessToken}" });
    }

    const metaRes = await registerMetadataToStore(store, token);
    if (!metaRes.ok) {
      return res.status(500).json({ success: false, status: metaRes.status, data: metaRes.data });
    }
    return res.json({ success: true, status: metaRes.status, data: metaRes.data });
  } catch (err) {
    log("debug/set-metadata error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Debug: read token stored in memory for a store
app.get("/debug/test", (req, res) => {
  const store = req.query.store;
  if (!store) return res.json({ error: "Provide ?store={storeHash}" });
  const token = storeTokens.get(store);
  if (!token) return res.json({ success: false, message: "No token for this store" });
  return res.json({ success: true, store, token: token.substring(0, 8) + "..." });
});

// Fallback: log all unmatched routes to see if BC calls a different path
app.all("*", (req, res) => {
  log(`✳️ Unmatched ${req.method} ${req.originalUrl} — replying 404`);
  res.status(404).json({ error: "Not found" });
});

// ---------- START ----------
app.listen(PORT, () => {
  log(`🚀 MyRover Carrier running on port ${PORT}`);
  log(`APP_URL=${APP_URL}`);
});
