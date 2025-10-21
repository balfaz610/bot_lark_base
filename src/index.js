import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import lark from "@larksuiteoapi/node-sdk";
import { saveMessage } from "./db.js";

dotenv.config();

const app = express();
app.use(express.json());

// ====================================================
// 🔹 LARK CLIENT
// ====================================================
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

// ====================================================
// 🔹 GEMINI CLIENT
// ====================================================
async function askGemini(prompt) {
  try {
    console.log("🔑 Gemini key:", process.env.GEMINI_KEY ? "Loaded" : "Missing");

    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      {
        params: { key: process.env.GEMINI_KEY },
        timeout: 10000, // ✅ timeout 10 detik
      }
    );

    return (
      res.data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Tidak ada jawaban dari Gemini."
    );
  } catch (err) {
    console.error("Gemini error:", {
      message: err.message,
      code: err.code,
      response: err.response?.status,
      data: err.response?.data,
    });
    return "⚠️ Terjadi error saat memanggil Gemini API.";
  }
}

// ====================================================
// 🔹 KIRIM PESAN KE LARK
// ====================================================
async function sendMessage(chatId, text) {
  try {
    await client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
    console.log("📩 Pesan terkirim ke Lark");
  } catch (err) {
    console.error("Send message error:", err.response?.data || err.message);
  }
}

// ====================================================
// 🔹 AMBIL DATA DARI LARK BASE
// ====================================================
async function getBaseData() {
  try {
    const baseToken = process.env.LARK_BASE_TOKEN;

    const res = await axios.get(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records`,
      {
        headers: {
          Authorization: `Bearer ${baseToken}`,
        },
      }
    );

    const records = res.data?.data?.items?.map((item) => item.fields) || [];
    const columns = records.length > 0 ? Object.keys(records[0]) : [];

    if (records.length === 0) {
      console.log("⚠️ Tidak ada data di tabel Lark Base.");
    } else {
      console.log(`✅ Lark Base loaded: ${records.length} records`);
    }

    return { columns, records };
  } catch (err) {
    console.error("Lark Base error:", err.response?.data || err.message);
    return { columns: [], records: [] };
  }
}

// ====================================================
// 🔹 PROSES PESAN USER
// ====================================================
async function handleBaseQuery(userMessage) {
  try {
    const { columns, records } = await getBaseData();

    if (records.length === 0) {
      return "⚠️ Tidak ada data di tabel Lark Base.";
    }

    const prompt = `
Kamu adalah AI asisten yang menjawab pertanyaan user HANYA berdasarkan data tabel berikut.
Jangan gunakan pengetahuan umum dari luar data ini.

Nama kolom:
${columns.join(", ")}

Contoh data (maks 50 baris):
${JSON.stringify(records.slice(0, 50), null, 2)}

Pertanyaan user:
"${userMessage}"

Tugas:
1. Analisis data di atas.
2. Jawab hanya jika datanya bisa ditemukan di tabel.
3. Jika tidak ada, jawab: "Data tidak ditemukan di tabel."
4. Jawab singkat tapi jelas.

Jawaban:
`;

    const answer = await askGemini(prompt);
    return answer;
  } catch (err) {
    console.error("handleBaseQuery error:", err);
    return "⚠️ Gagal memproses pertanyaan ke Lark Base.";
  }
}

// ====================================================
// 🔹 WEBHOOK LARK (NON-BLOCKING)
// ====================================================
app.post("/api/lark", async (req, res) => {
  const body = req.body;

  // ✅ handle verification
  if (body.type === "url_verification") {
    return res.json({ challenge: body.challenge });
  }

  // ✅ langsung kirim response biar Vercel nggak timeout
  res.status(200).send();

  // Jalankan worker async
  processWebhook(body);
});

async function processWebhook(body) {
  try {
    const event = body?.event;
    if (!event?.message) return;

    const message = JSON.parse(event.message.content).text.trim();
    const chatId = event.message.chat_id;
    const sessionId = chatId + "_" + event.sender.sender_id.user_id;

    console.log(`[DEBUG] New message: ${message}`);

    const reply = await handleBaseQuery(message);

    await saveMessage(sessionId, message, reply);
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error("Webhook error:", err);
  }
}

// ====================================================
// 🔹 DEFAULT ROUTE
// ====================================================
app.get("/", (req, res) => {
  res.send("✅ Lark Bot + Gemini + Lark Base + Firestore is running!");
});

// ====================================================
// 🔹 RUN LOCAL ONLY
// ====================================================
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// ====================================================
// 🔹 EXPORT UNTUK VERCEL
// ====================================================
export default app;
