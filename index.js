import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// === 🔧 CONFIGURATION ===
const STORE_HASH = "sjd7gztdev"; // your BigCommerce store hash
const CLIENT_ID = "do8br6kf70cvh5klt4ffk7mvz3qb6rp";
const ACCESS_TOKEN = "d0ubep2i3smp9cabsyyby31hvdd8171";
const CARRIER_ID = 521;
const BASE_URL = "https://myrover-carrier.onrender.com";

// === 🚚 REGISTER CARRIER WITH BIGCOMMERCE ===
async function registerCarrier() {
  try {
    console.log("🚀 Registering MyRover carrier with BigCommerce...");

    const res = await fetch(`https://api.bigcommerce.com/stores/${STORE_HASH}/v2/shipping/carriers`, {
      method: "POST",
      headers: {
        "X-Auth-Token": ACCESS_TOKEN,
        "X-Auth-Client": CLIENT_ID,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        carrier_id: CARRIER_ID,
        name: "MyRover Shipping",
        code: "myrover",
        type: "custom",
        settings: {
          name: "MyRover Delivery",
          is_enabled: true,
          connection: {
            url: `${BASE_URL}/rates`,
          },
          test_connection: {
            url: `${BASE_URL}/api/check`,
          },
        },
      }),
    });

    const data = await res.json();
    console.log("✅ Carrier registration response:", data);
  } catch (err) {
    console.error("❌ Error registering carrier:", err.message);
  }
}

// === 🧩 CHECK ENDPOINT ===
app.post("/api/check", async (req, res) => {
  console.log("✅ /api/check HIT: Account Status Check");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  const response = {
    data: {
      id: "myrover",
      name: "MyRover Shipping",
      account_status: "active",
      connected: true,
      message: "Connection verified successfully",
    },
  };

  console.log("🚀 Sending Response:", JSON.stringify(response, null, 2));
  return res.status(200).json(response);
});

// === 📦 RATES ENDPOINT ===
app.post("/rates", async (req, res) => {
  console.log("✅ /rates HIT");
  console.log("Request body:", JSON.stringify(req.body, null, 2));

  try {
    const rateResponse = {
      data: [
        {
          carrier_id: CARRIER_ID,
          carrier_code: "myrover",
          carrier_name: "MyRover Express",
          rate_id: "MYROVER_STANDARD",
          rate_name: "MyRover Delivery (1–2 days)",
          cost: 9.99,
          transit_time: "1-2 business days",
          currency: "CAD",
          description: "Fast delivery within GTA area",
        },
      ],
    };

    console.log("🚀 Sending rate response:", JSON.stringify(rateResponse, null, 2));
    return res.status(200).json(rateResponse);
  } catch (err) {
    console.error("❌ Error in /rates:", err.message);
    return res.status(500).json({ error: "Rate calculation failed" });
  }
});

// === 🏠 ROOT ROUTE ===
app.get("/", (req, res) => {
  res.send("🚚 MyRover Carrier API is running successfully!");
});

// === 🚀 START SERVER ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  await registerCarrier(); // auto-register carrier when server starts
});
