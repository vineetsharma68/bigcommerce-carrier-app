import express from "express";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 10000;
const BASE_URL = process.env.BASE_URL || "https://myrover-carrier.onrender.com";
const MY_CARRIER_ID = "myrover_shipping";
const MY_DISPLAY_NAME = "MyRover Shipping";

// 🟢 Root route
app.get("/", (req, res) => {
  res.status(200).send("✅ MyRover Carrier App is running");
});

// 🟣 Auth callback (BigCommerce → App)
/*app.get("/api/auth/callback", (req, res) => {
  console.log("✅ /api/auth/callback HIT");
  res.status(200).json({ message: "Auth callback received" });
});*/
app.get("/api/auth/callback", async (req, res) => {
  console.log("✅ /api/auth/callback HIT with query:", req.query);

  const { code, context, scope } = req.query;

  if (!code || !context) {
    return res.status(400).send("❌ Missing required OAuth parameters.");
  }

  try {
    // BigCommerce OAuth exchange request
    const tokenResponse = await axios.post("https://login.bigcommerce.com/oauth2/token", {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: `${process.env.APP_URL}/api/auth/callback`,
      grant_type: "authorization_code",
      code,
      scope,
      context,
    });

    console.log("🔑 BigCommerce Token Response:", tokenResponse.data);

    const { access_token, store_hash, user } = tokenResponse.data;
    console.log("✅ Access Token:", access_token);
    console.log("🏬 Store Hash:", store_hash);
    console.log("👤 User Info:", user);

    // 👉 यहां तुम इसे DB में save कर सकते हो
    // await saveToDB(store_hash, access_token);

    res.send(`
      <h2>✅ MyRover App Installed Successfully!</h2>
      <p><b>Store Hash:</b> ${store_hash}</p>
      <p><b>Access Token:</b> ${access_token}</p>
      <p><b>Scope:</b> ${scope}</p>
    `);
  } catch (err) {
    console.error("❌ OAuth Error:", err.response?.data || err.message);
    res.status(500).send("OAuth exchange failed. Check Render logs for details.");
  }
});

// 🟣 Load callback (BigCommerce admin load)
app.get("/api/load", (req, res) => {
  console.log("✅ /api/load HIT");
  res.status(200).json({ message: "App loaded successfully" });
});

// 🟣 Uninstall callback
app.post("/api/uninstall", (req, res) => {
  console.log("✅ /api/uninstall HIT");
  res.status(200).json({ message: "App uninstalled successfully" });
});

// 🟣 Metadata endpoint (register carrier)
app.get("/api/metadata", (req, res) => {
  console.log("✅ /api/metadata HIT: Sending Carrier Metadata");

  const base_url = process.env.APP_URL;

  res.status(200).json({
    data: {
      carriers: [
        {
          id: "myrover",
          name: "MyRover Shipping",
          label: "MyRover Shipping",
          countries: ["CA"],
          settings_url: `${base_url}/api/check`,
          connection_form: {
            properties: []
          },
          rate_provider: {
            type: "external",
            url: `${base_url}/api/rates`
          }
        }
      ]
    }
  });
});



// 🟣 Account status check (Configuration test)
app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT: Account Status Check");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  const responseData = {
    data: {
      id: "myrover",
      name: "MyRover Shipping",
      status: "OK",
      connected: true,
      account_status: "active",
      message: "Connection verified successfully"
    }
  };

  console.log("🚀 Sending Response:", JSON.stringify(responseData, null, 2));
  res.status(200).json(responseData);
});








// 🟣 Rates endpoint (for shipping quote calculation)
app.post("/api/rates", (req, res) => {
  console.log("✅ /api/rates HIT");

  const { origin, destination, packages } = req.body;
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));

  // Basic rate example (static for now)
  const response = {
    data: {
      rates: [
        {
          carrier_id: MY_CARRIER_ID,
          carrier_name: MY_DISPLAY_NAME,
          service_code: "MYROVER_EXPRESS",
          service_name: "MyRover Express",
          cost: 12.5,
          transit_time: "2-3 days",
          currency: "CAD"
        }
      ]
    }
  };

  res.status(200).json(response);
});

// 🟣 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
