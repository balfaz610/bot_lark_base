import express from "express";
import axios from "axios";
import lark from "@larksuiteoapi/node-sdk";
import dotenv from "dotenv";
import { getBaseData } from "./utils/larkBase.js";

dotenv.config();

const app = express();
app.use(express.json());

// ====================================================
// 🔹 Inisialisasi Client Lark
// ====================================================
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

// ====================================================
// 🔹 Fungsi Kirim Pesan ke Chat
// ====================================================
async function sendMessage(receiveType, receiveId, text) {
  try {
    await client.im.message.create({
      params: { receive_id_type: receiveType },
      data: {
        receive_id: receiveId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
  } catch (err) {
    console.error("❌ Gagal kirim pesan:", err.response?.data || err.message);
  }
}

// ====================================================
// 🔹 Webhook Lark
// ====================================================
app.post("/api/lark", async (req, res) => {
  try {
    const { header, event, type, challenge } = req.body;

    // ✅ URL verification
    if (type === "url_verification") {
      return res.json({ challenge });
    }

    const messageObj = event?.message;
    if (!messageObj) return res.status(200).send();

    const userMessage = JSON.parse(messageObj.content)?.text?.trim();
    const receiveId = messageObj.chat_id;
    const receiveType = "chat_id";

    if (!userMessage) {
      await sendMessage(receiveType, receiveId, "⚠️ Pesan kosong, bro.");
      return res.status(200).send();
    }

    console.log(`📩 Pesan user: ${userMessage}`);

    // ====================================================
    // 🔹 Ambil Data dari Lark Base
    // ====================================================
    const { columns, records } = await getBaseData();
    if (records.length === 0) {
      await sendMessage(receiveType, receiveId, "⚠️ Tidak ada data di tabel Lark Base.");
      return res.status(200).send();
    }

    // ====================================================
    // 🔹 Buat Prompt Dynamic ke Gemini (Natural NLP)
    // ====================================================
    const prompt = `
Kamu adalah asisten AI yang dapat membaca dan memahami data berbentuk JSON.
Data berikut diambil dari Lark Base (maksimal 50 data pertama):

${JSON.stringify(records.slice(0, 50), null, 2)}

Tugas kamu:
- Jawablah pertanyaan user berdasarkan data di atas.
- Gunakan Bahasa Indonesia.
- Jawaban harus dalam bentuk daftar ringkas jika ada lebih dari 1 hasil.
- Jika tidak ada hasil yang cocok, katakan: "Tidak ditemukan data yang sesuai."

User bertanya: "${userMessage}"

Jawaban:
`;

    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      }
    );

    const reply =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Tidak ada respons dari Gemini.";

    console.log("🤖 Jawaban Gemini:", reply);

    await sendMessage(receiveType, receiveId, reply);
    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error webhook:", err.response?.data || err.message);
    res.status(500).send({ error: err.message });
  }
});

// ====================================================
// 🔹 Default Route
// ====================================================
app.get("/", (req, res) => {
  res.send("✅ Lark Bot + Gemini + Lark Base sudah aktif bro!");
});

// ====================================================
// 🔹 Jalankan Lokal
// ====================================================
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server jalan di http://localhost:${PORT}`);
  });
}

export default app;