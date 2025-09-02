// server.js
import express from "express";

const app = express();
app.use(express.json());

// /api/rates endpoint
app.post("/api/rates", (req, res) => {
  try {
    const { origin, destination, items } = req.body;

    console.log("Rate request received:", { origin, destination, items });

    // 🚨 यहां आप MyRover.io API call कर सकते हैं
    // फिलहाल dummy response भेज रहे हैं
    const rates = [
      {
        carrier_quote: {
          code: "standard",
          display_name: "Standard Shipping",
          cost: 10.5
        }
      },
      {
        carrier_quote: {
          code: "express",
          display_name: "Express Shipping",
          cost: 25.0
        }
      }
    ];

    res.json({ data: rates });
  } catch (err) {
    console.error("Error generating rates:", err);
    res.status(500).json({ error: "Unable to generate rates" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
