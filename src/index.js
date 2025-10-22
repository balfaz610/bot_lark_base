import express from "express";
import axios from "axios";
import lark from "@larksuiteoapi/node-sdk";
import dotenv from "dotenv";
import { getBaseData } from "./utils/larkBase.js";

dotenv.config();

const app = express();
app.use(express.json());

// Simpan message_id yang sudah diproses
const processedMessages = new Set();

// ====================================================
// 🔹 LARK CLIENT
// ====================================================
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

app.get("/", (req, res) => {
  res.status(200).send("✅ Bot Lark aktif bro!");
});

// ====================================================
// 🔹 Kirim pesan balasan
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
// 🔹 Webhook Handler
// ====================================================
app.post("/api/lark", async (req, res) => {
  try {
    const { header, event, type, challenge } = req.body;

    // 🔹 Verifikasi URL
    if (type === "url_verification") {
      return res.json({ challenge });
    }

    // 🔹 Hanya proses event pesan
    if (header?.event_type !== "im.message.receive_v1") {
      return res.status(200).send();
    }

    const messageId = event?.message?.message_id;
    if (!messageId) return res.status(200).send();

    // 🚫 Cegah duplikat (jika message_id sudah pernah diproses)
    if (processedMessages.has(messageId)) {
      console.log("⏩ Pesan sudah diproses sebelumnya, dilewati:", messageId);
      return res.status(200).send();
    }
    processedMessages.add(messageId);

    // 🚫 Jangan balas pesan dari bot sendiri
    if (event?.sender?.sender_type === "bot") {
      console.log("🚫 Pesan dari bot sendiri, dilewati.");
      return res.status(200).send();
    }

    // Ambil isi pesan
    const messageObj = event.message;
    const userMessage = JSON.parse(messageObj.content)?.text?.trim();
    const receiveId = messageObj.chat_id;
    const receiveType = "chat_id";

    if (!userMessage) {
      await sendMessage(receiveType, receiveId, "⚠️ Pesan kosong, bro.");
      return res.status(200).send();
    }

    // ====================================================
    // 🔹 Ambil data dari Lark Base
    // ====================================================
    const { columns, records } = await getBaseData();
    if (records.length === 0) {
      await sendMessage(receiveType, receiveId, "⚠️ Tidak ada data di tabel Lark Base.");
      return res.status(200).send();
    }

    // ====================================================
    // 🔹 Prompt ke Gemini
    // ====================================================
    const prompt = `
Kamu adalah asisten yang menjawab berdasarkan data tabel berikut:
Kolom: ${columns.join(", ")}
Data contoh:
${JSON.stringify(records.slice(0, 20), null, 2)}

User bertanya: "${userMessage}"
Jawablah berdasarkan data di atas.
Jika tidak relevan, jawab: "Data tidak ditemukan di tabel."
Gunakan bahasa Indonesia santai.
`;

    // ====================================================
    // 🔹 Kirim ke Gemini API
    // ====================================================
    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );

    let reply =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Tidak ada respons dari Gemini.";

    reply = reply
      .replace(/```[\s\S]*?```/g, "")
      .split(/Oke,|oke,|Baik,|baik,/i)[0]
      .trim();

    if (!reply) reply = "⚠️ Tidak ada jawaban relevan dari Gemini.";

    await sendMessage(receiveType, receiveId, reply);
    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error di webhook:", err.response?.data || err.message);
    res.status(500).send({ error: err.message });
  }
});

// ====================================================
// 🔹 Jalankan lokal
// ====================================================
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Server jalan di http://localhost:${PORT}`));
}

export default app;
