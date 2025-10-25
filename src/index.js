import express from "express";
import axios from "axios";
import lark from "@larksuiteoapi/node-sdk";
import dotenv from "dotenv";
import { getBaseData } from "./utils/larkBase.js";
import { saveMessage } from "./db.js"; // opsional, kalau mau log ke Firestore

dotenv.config();

const app = express();
app.use(express.json());

// In-memory cache untuk deteksi duplikasi event (anti double reply)
const processedEventIds = new Set();

app.get("/", (req, res) => {
  res.status(200).send("✅ Bot Lark Base aktif, bro!");
});


const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

// ====================================================
// 🔹 Kirim Pesan Balasan ke Lark
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

    // ✅ Validasi URL Webhook
    if (type === "url_verification") {
      return res.json({ challenge });
    }

    // ✅ Anti-loop: abaikan pesan dari bot sendiri
    if (event?.sender?.sender_type === "bot") {
      console.log("🤖 Abaikan pesan dari bot sendiri");
      return res.status(200).send();
    }

    // ✅ Anti-duplikasi: cek event_id
    const eventId = header?.event_id;
    if (processedEventIds.has(eventId)) {
      console.log("⏩ Event duplikat, di-skip:", eventId);
      return res.status(200).send();
    }
    processedEventIds.add(eventId);

    // Bersihkan cache event_id lama (biar gak numpuk)
    if (processedEventIds.size > 1000) {
      const first = processedEventIds.values().next().value;
      processedEventIds.delete(first);
    }

    const messageObj = event?.message;
    if (!messageObj) return res.status(200).send();

    // ✅ Parse pesan text
    let userMessage = "";
    try {
      userMessage = JSON.parse(messageObj.content)?.text?.trim();
    } catch {
      console.warn("⚠️ Pesan non-text, dilewati");
      return res.status(200).send();
    }

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
    // 🔹 Prompt dinamis
    // ====================================================
    const prompt = `
Kamu adalah AI asisten yang menjawab pertanyaan berdasarkan data berikut:
Kolom: ${columns.join(", ")}
Data (maks 20 contoh):
${JSON.stringify(records.slice(0, 20), null, 2)}

User bertanya: "${userMessage}"
Jawablah berdasarkan data di atas. 
Jika tidak relevan dengan data, jawab: "Data tidak ditemukan di tabel."
Gunakan bahasa Indonesia alami dan santai.
`;

    // ====================================================
    // 🔹 Kirim ke Gemini API
    // ====================================================
    let reply;
    try {
      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
        { contents: [{ parts: [{ text: prompt }] }] }
      );
      reply =
        geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "⚠️ Tidak ada respons dari Gemini.";
    } catch (err) {
      console.error("❌ Gagal ke Gemini:", err.response?.data || err.message);
      reply = "⚠️ Maaf bro, server AI lagi error. Coba lagi nanti ya 🙏";
    }

    // ====================================================
    // 🔹 Kirim Balasan ke User
    // ====================================================
    await sendMessage(receiveType, receiveId, reply);

    // (Opsional) Simpan log ke Firestore
    try {
      await saveMessage(receiveId, userMessage, reply);
    } catch (e) {
      console.warn("⚠️ Gagal simpan log chat:", e.message);
    }

    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error webhook:", err.response?.data || err.message);
    res.status(500).send({ error: err.message });
  }
});

// ====================================================
// 🔹 Jalankan Lokal
// ====================================================
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running di http://localhost:${PORT}`);
  });
}

// ====================================================
// 🔹 Export untuk Vercel
// ====================================================
export default app;
