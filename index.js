import express from "express";
import cors from "cors";
import fs from "fs";
import crypto from "crypto";
import process from "process";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.MAILCHIMP_API_KEY;
const LIST_ID = process.env.LIST_ID;
const DC = API_KEY.split("-")[1];

console.log(API_KEY, LIST_ID);

const campaignImageMap = JSON.parse(
  fs.readFileSync(new URL("./campaignImageMap.json", import.meta.url)),
);

app.get("/api/campaigns", async (req, res) => {
  try {
    const response = await fetch(
      `https://${DC}.api.mailchimp.com/3.0/campaigns`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`,
        },
      },
    );

    if (!response.ok) {
      return res.status(500).json({ error: "Mailchimp fetch failed" });
    }

    const data = await response.json();

    res.json(
      data.campaigns.map((c) => ({
        id: c.id,
        title: c.settings.title,
        subject: c.settings.subject_line,
        date: c.send_time,
        long_archive_url: c.long_archive_url,
        image: campaignImageMap[c.id] ?? null,
      })),
    );
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/subscribe", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const subscriberHash = crypto
    .createHash("md5")
    .update(email.toLowerCase())
    .digest("hex");

  try {
    const response = await fetch(
      `https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members/${subscriberHash}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_address: email,
          status_if_new: "subscribed",
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json(data);
    }

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

app.listen(3001, () => {
  console.log("API running on http://localhost:3001");
});
