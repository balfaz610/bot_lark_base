import express from "express";
import lark from "@larksuiteoapi/node-sdk";
import { getBaseData } from "./larkBase.js";

const app = express();
app.use(express.json());

const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

app.post("/api/lark", async (req, res) => {
  try {
    const { header, event } = req.body;

    // handle verifikasi URL webhook
    if (header?.event_type === "url_verification")
      return res.send({ challenge: req.body.challenge });

    console.log("📩 Event diterima:", header?.event_type);

    const records = await getBaseData();
    console.log(`✅ Lark Base OK: ${records.length} records diambil`);

    // === Kirim pesan balasan ke user ===
    await client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: event.message.chat_id,
        msg_type: "text",
        content: JSON.stringify({
          text: `📊 Lark Base berhasil dibaca: ${records.length} baris data`,
        }),
      },
    });

    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error di /api/lark:", err.message);
    res.status(500).send({ error: err.message });
  }
});

export default app;
