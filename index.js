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
/*app.get("/api/load", (req, res) => {
  console.log("✅ /api/load HIT");
    // यहां आपका App UI/Settings पेज रेंडर होना चाहिए, JSON नहीं।
    // यह endpoint सीधे BigCommerce App iframe में लोड होता है।
    res.send("<h1>Welcome to MyRover Settings</h1><p>Carrier configured successfully!</p>");
});*/

const crypto = require('crypto');

// 🔑 सहायक फ़ंक्शन: BigCommerce signed_payload को वेरिफाई करने के लिए
// यह सुनिश्चित करता है कि अनुरोध (request) BigCommerce से आया है।
function verifySignedRequest(signedPayload, clientSecret) {
    if (!signedPayload || !clientSecret) return false;

    const parts = signedPayload.split('.');
    if (parts.length !== 2) return false;

    // 🔑 BigCommerce के Base64URL को मानक Base64 में बदलें (URL Safe)
    const urlSafeData = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const urlSafeSignature = parts[0].replace(/-/g, '+').replace(/_/g, '/');

    const signature = Buffer.from(urlSafeSignature, 'base64').toString('hex');
    const data = Buffer.from(urlSafeData, 'base64').toString('utf8'); // डेटा को utf8 के रूप में डिकोड करें

    // अपेक्षित हस्ताक्षर (Expected Signature) की गणना
    const expectedSignature = crypto
        .createHmac('sha256', clientSecret)
        .update(parts[1]) // मूल, असंशोधित डेटा भाग का उपयोग करें
        .digest('hex');
        
    // एक और दुर्लभ समस्या: कुछ कार्यान्वयन पूरे 'भागों' का उपयोग करते हैं
    // .update(parts[1]) के बजाय .update(parts[0] + '.' + parts[1]) का प्रयास करें यदि उपर्युक्त विफल हो

    // 🔑 लॉग में दोनों Signature देखें
    console.log(`DEBUG: Actual Signature (Hmac): ${expectedSignature}`);
    console.log(`DEBUG: Incoming Signature: ${signature}`);


    return expectedSignature === signature;
}

// -------------------------------------------------------------
// ✅ Load Callback (जब उपयोगकर्ता App Launch पर क्लिक करता है)
// -------------------------------------------------------------
// ... (crypto और verifySignedRequest फ़ंक्शन को अपरिवर्तित रखें)

app.get("/api/load", (req, res) => {
    console.log("✅ /api/load HIT");

    const signedPayload = req.query.signed_payload;
    const clientSecret = process.env.CLIENT_SECRET;

    // 🔑 DEBUGGING STEP 1: Secret और Payload की लंबाई जाँचें
    console.log(`DEBUG: Client Secret Length: ${clientSecret ? clientSecret.length : 'NULL'}`);
    console.log(`DEBUG: Signed Payload Length: ${signedPayload ? signedPayload.length : 'NULL'}`);
    
    // यह सुनिश्चित करने के लिए कि कोई छिपा हुआ स्पेस नहीं है
    const trimmedSecret = clientSecret ? clientSecret.trim() : null;
    console.log(`DEBUG: Trimmed Secret Length: ${trimmedSecret ? trimmedSecret.length : 'NULL'}`);


    if (!signedPayload) {
        return res.status(400).send("Bad Request: Missing signed_payload parameter.");
    }
    
    // 🔑 Trimmed Secret का उपयोग करके वेरिफिकेशन का प्रयास करें
    if (!verifySignedRequest(signedPayload, trimmedSecret)) {
        console.error("❌ Load Error: Invalid signed_payload signature!");
        // ❌ यदि यह यहां फेल होता है, तो 99.9% CLIENT_SECRET गलत है।
        return res.status(401).send("Unauthorized: Invalid request signature.");
    }

    console.log("✅ Load Verification Successful. Sending success HTML.");

    // ... (HTML response code जारी रखें)
});

// ✅ 7️⃣ Account verification (used by BigCommerce to check status)
/*app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT");
  return res.status(200).json({ status: "active" });
});*/
app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT: Sending simple status: active");
  
  // 🔑 200 OK स्टेटस और सरल JSON
  return res.status(200).json({ 
    "status": "active",
    "messages": [] // कभी-कभी एक खाली messages array की आवश्यकता होती है 
  });
});


// ✅ 8️⃣ Metadata endpoint (BigCommerce checks available countries/services)
// सुनिश्चित करें कि यह कोड आपके index.js में मौजूद है और सही है
app.get("/api/metadata", (req, res) => {
  console.log("✅ /api/metadata HIT");
  
  const base_url = process.env.APP_URL; 

  res.status(200).json({
    carriers: [
      {
        carrier_id: "myrover",
        label: "MyRover Shipping",
        countries: ["CA"], 
        settings_url: `${base_url}/api/check`, // या जो भी आप उपयोग कर रहे हैं
        rates_url: `${base_url}/api/rates`, 
      },
    ],
  });
});


// ✅ 9️⃣ Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
