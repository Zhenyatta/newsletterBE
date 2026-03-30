import express from "express";
import cors from "cors";
import fs from "fs";
import { createHash } from "crypto";
import process from "process";
import https from "https";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.MAILCHIMP_API_KEY;
const LIST_ID = process.env.LIST_ID;
const PORT = process.env.PORT || 3001;

if (!API_KEY || !LIST_ID) {
  throw new Error("Missing required environment variables");
}

const DC = API_KEY.split("-")[1];

const agent = new https.Agent({ keepAlive: true });

const campaignImageMap = JSON.parse(
  fs.readFileSync(new URL("./campaignImageMap.json", import.meta.url)),
);

const getAuthHeader = () =>
  `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`;

const isValidEmail = (email) =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

app.get("/api/campaigns", async (req, res) => {
  try {
    const response = await fetch(
      `https://${DC}.api.mailchimp.com/3.0/campaigns`,
      {
        headers: {
          Authorization: getAuthHeader(),
        },
        agent,
      },
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "Failed to fetch campaigns from Mailchimp",
      });
    }

    const data = await response.json();

    const campaigns = data.campaigns.map((c) => ({
      id: c.id,
      title: c.settings.title,
      subject: c.settings.subject_line,
      date: c.send_time,
      long_archive_url: c.long_archive_url,
      image: campaignImageMap[c.id] ?? null,
    }));

    res.json(campaigns);
  } catch (e) {
    console.error("Campaign fetch error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/subscribe", async (req, res) => {
  const { email } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const subscriberHash = createHash("md5")
    .update(email.toLowerCase())
    .digest("hex");

  try {
    const response = await fetch(
      `https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members/${subscriberHash}`,
      {
        method: "PUT",
        headers: {
          Authorization: getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_address: email,
          status_if_new: "subscribed",
        }),
        agent,
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({
        error: "Subscription failed",
        details: data?.detail || null,
      });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error("Subscribe error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
