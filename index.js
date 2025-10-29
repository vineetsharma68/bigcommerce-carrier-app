require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// --- CONSTANTS ---
const API_BASE_URL = "https://api.bigcommerce.com/stores";
const MY_CARRIER_ID = "myrover_carrier"; // आपके मेटाडेटा के साथ मेल खाना चाहिए
const MY_RATE_URL = `${process.env.APP_URL}/api/rates`; 
const MY_DISPLAY_NAME = "MyRover Shipping";


// ----------------------------------------------------------------------
// CARRIER MANAGEMENT HELPER FUNCTION
// ----------------------------------------------------------------------

/**
 * Checks for and registers/updates the Carrier Object in BigCommerce.
 */
async function manageBcCarrierConnection(storeHash, accessToken) {
    
    // Placeholder function: API calls require these headers
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Auth-Token": accessToken, 
    };
    
    const apiEndpoint = `${API_BASE_URL}/${storeHash}/v2/shipping/carrier/connections`;

    // 1. GET: मौजूदा कनेक्शनों की जाँच करें
    try {
        const checkResponse = await axios.get(apiEndpoint, { headers });
        const existingConnections = checkResponse.data;

        let existingBcId = null;
        for (const carrier of existingConnections) {
            if (carrier.carrier_id === MY_CARRIER_ID) {
                existingBcId = carrier.id;
                break;
            }
        }

        const carrierPayload = {
            carrier_id: MY_CARRIER_ID,
            display_name: MY_DISPLAY_NAME,
            type: "rate_calculator",
            rate_url: MY_RATE_URL, 
            // validation_url: `${process.env.APP_URL}/api/validate`, // अगर आप Validation Endpoint जोड़ते हैं
        };

        if (existingBcId) {
            // 2. PUT: अगर कनेक्शन मिल गया, तो अपडेट करें
            await axios.put(`${apiEndpoint}/${existingBcId}`, carrierPayload, { headers });
            console.log(`✅ Carrier ID ${existingBcId} updated (PUT).`);
            
        } else {
            // 3. POST: अगर कनेक्शन नहीं मिला, तो नया बनाएँ
            const createResponse = await axios.post(apiEndpoint, carrierPayload, { headers });
            console.log(`✅ New Carrier connection created (POST): ID ${createResponse.data.id}`);
        }
    } catch (error) {
        // यहाँ error को throw करना महत्वपूर्ण है ताकि App installation fail हो जाए यदि Carrier setup fail होता है
        console.error("❌ Carrier Connection Management Failed:", error.response?.data || error.message);
        throw new Error("BigCommerce Carrier setup failed during installation.");
    }
}

/**
 * Placeholder for saving credentials to your database (DB).
 * NOTE: You MUST implement this function to store tokens securely.
 */
async function saveStoreCredentialsToDB(storeHash, accessToken) {
    // Implement your database logic here (e.g., using Mongoose/Sequelize)
    console.log(`🔒 Credentials saved for store: ${storeHash}`);
    // Example: await db.collection('stores').updateOne({ hash: storeHash }, { $set: { token: accessToken } }, { upsert: true });
}

// ----------------------------------------------------------------------
// EXPRESS ROUTES
// ----------------------------------------------------------------------

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


// ✅ 3️⃣ OAuth Step 2 - Callback from BigCommerce (MODIFIED)
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

    // --- NEW LOGIC: Extract Tokens and Manage Carrier ---
    const { access_token } = tokenResponse.data;
    // context format: "stores/xxxxxx"
    const storeHash = context.split('/')[1]; 

    // A. क्रेडेंशियल्स सहेजें (फ्यूचर API कॉल्स के लिए)
    await saveStoreCredentialsToDB(storeHash, access_token); 

    // B. Carrier Connection की जाँच करें और बनाएँ/अपडेट करें
    await manageBcCarrierConnection(storeHash, access_token);

    // C. सफलता पर App UI या डैशबोर्ड पर रीडायरेक्ट करें
    console.log("✅ App installed and Carrier configured successfully!");
    
    // मर्चेंट को अपने App के UI में रीडायरेक्ट करें (उदाहरण के लिए /dashboard)
    res.redirect(`${process.env.APP_URL}/dashboard?store_hash=${storeHash}`); 
    // यदि आपके पास UI नहीं है, तो आप बस res.send("Success") कर सकते हैं
    // res.send("✅ App installed successfully! You can close this window now.");

  } catch (err) {
    console.error("❌ App Installation/OAuth/Carrier Setup Error:", err.response?.data || err.message);
    res.status(500).send("App Installation failed. Check server logs.");
  }
});


// ✅ 4️⃣ Uninstall callback
app.post("/api/uninstall", (req, res) => {
  console.log("❌ App Uninstalled:", req.body);
    // TODO: यहां डेटाबेस से स्टोर क्रेडेंशियल्स हटाएँ!
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


// ✅ 6️⃣ Shipping Rates endpoint (BigCommerce calls this URL)
app.post("/api/rates", async (req, res) => {
  const { origin, destination, items } = req.body;
  console.log("📦 Rate request received:", { origin, destination, items });

    // NOTE: आपको यहां BigCommerce से storeHash प्राप्त करने के लिए एक तरीका लागू करना होगा
    // ताकि आप उस स्टोर के लिए database से access_token ला सकें।
    // सुरक्षा कारणों से, BigCommerce rates call में storeHash नहीं भेजता है।
    
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

    // BigCommerce को rates लौटाएँ
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


// Load Callback (केवल App iframe लोड होने पर)
app.get("/api/load", (req, res) => {
  console.log("✅ /api/load HIT");
    // यहां आपका App UI/Settings पेज रेंडर होना चाहिए, JSON नहीं।
    // यह endpoint सीधे BigCommerce App iframe में लोड होता है।
    res.send("<h1>Welcome to MyRover Settings</h1><p>Carrier configured successfully!</p>");
});


// ✅ 7️⃣ Account verification (used by BigCommerce to check status)
app.post("/api/check-v2", (req, res) => {
  console.log("✅ /api/check-v2 HIT");
  return res.status(200).json({ status: "active" });
});


// 🚚 BigCommerce Test Connection Endpoint
app.post("/v1/shipping/connection", (req, res) => {
  console.log("✅ /v1/shipping/connection HIT from BigCommerce");
  return res.status(200).json({
    status: "OK",
    message: "MyRover connection verified successfully"
  });
});

// 📦 Get Shipping Rates Endpoint
app.post("/v1/shipping/rates", async (req, res) => {
  console.log("📦 /v1/shipping/rates HIT from BigCommerce");
  try {
    const rateResponse = {
      data: [
        {
          carrier_id: 530,
          carrier_code: "myrover",
          carrier_name: "MyRover Express",
          rate_id: "MYROVER_STANDARD",
          rate_name: "MyRover Delivery (1–2 Days)",
          cost: 9.99,
          currency: "CAD",
          transit_time: "1–2 business days",
          description: "Fast local delivery via MyRover"
        }
      ]
    };
    res.status(200).json(rateResponse);
  } catch (err) {
    console.error("❌ Error in /rates:", err);
    res.status(500).json({ error: "Failed to fetch rates" });
  }
});

// 🧾 Register Metadata
async function registerMetadata(storeHash, token) {
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/app/metadata`;
  const metadata = [
    { key: "shipping_connection", value: "/v1/shipping/connection" },
    { key: "shipping_rates", value: "/v1/shipping/rates" }
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(metadata)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("❌ Metadata registration failed:", data);
    return data;
  }

  console.log("✅ Metadata registered:", data);
  return data;
}

// 🧩 Debug Route — Test Stored Token
app.get("/debug/test", (req, res) => {
  const storeHash = req.query.store;
  const token = storeTokens.get(storeHash);
  if (!token) return res.json({ error: "No token or store hash loaded in memory" });
  res.json({ success: true, store: storeHash, token });
});

// 🧩 Debug Route — Force Register Metadata


app.get("/v1/metadata", async (req, res) => {
  console.log("📦 /v1/metadata HIT from BigCommerce");

  try {
    const metadata = {
      meta: {
        version: "1.0",
        documentation: "https://myrover.io/docs/carrier-api",
      },
      data: {
        carrier_name: "MyRover Express",
        carrier_code: "myrover",
        description: "MyRover Carrier Integration for BigCommerce",
        supported_methods: [
          {
            type: "connection_test",
            endpoint: "/v1/shipping/connection",
            method: "POST",
          },
          {
            type: "get_rates",
            endpoint: "/v1/shipping/rates",
            method: "POST",
          }
        ],
      },
    };

    return res.status(200).json({ success: true, result: metadata });
  } catch (err) {
    console.error("❌ Metadata Error:", err);
    return res.status(500).json({
      success: false,
      message: "Metadata generation failed",
      error: err.message,
    });
  }
});

// ✅ 9️⃣ Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
