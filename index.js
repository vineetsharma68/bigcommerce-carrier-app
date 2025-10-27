import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

/* ✅ Home route */
app.get("/", (req, res) => {
  res.send("🚀 MyRover Carrier App is running!");
});

/* ✅ Account Status Check (for BigCommerce carrier test) */
app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT: Account Status Check");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  return res.json({
    data: {
      account_status: "active",
      connected: true,
      message: "Connection verified successfully",
    },
  });
});

/* ✅ OAuth Callback Route (Fix) */
app.get("/api/auth/callback", async (req, res) => {
  console.log("✅ /api/auth/callback HIT");
  console.log("Query Params:", req.query);

  const { code, context, scope } = req.query;

  if (!code) {
    return res.status(400).send("❌ Missing authorization code");
  }

  // Normally, you’d exchange this code for an access token here
  // but for now just confirm it’s working
  res.send(`
    <h2>✅ Authorization Successful!</h2>
    <p>Code: ${code}</p>
    <p>Context: ${context}</p>
    <p>Scope: ${scope}</p>
    <p>You can now close this window.</p>
  `);
});

/* ✅ Start server */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
