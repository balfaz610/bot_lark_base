import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let serviceAccount;

try {
  if (process.env.FIREBASE_KEY_BASE64) {
    // ✅ Di Vercel: ambil dari environment variable Base64
    const decoded = Buffer.from(process.env.FIREBASE_KEY_BASE64, "base64").toString("utf8");
    serviceAccount = JSON.parse(decoded);
    console.log("✅ Firebase key loaded from Base64 ENV");
  } else {
    // ✅ Di lokal: baca dari file firebase-key.json
    const firebaseConfigPath =
      process.env.FIREBASE_CONFIG_PATH || path.join(__dirname, "..", "firebase-key.json");

    if (!fs.existsSync(firebaseConfigPath))
      throw new Error("Firebase config file tidak ditemukan!");
    serviceAccount = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    console.log("✅ Firebase key loaded from local file");
  }
} catch (err) {
  console.error("❌ Gagal load Firebase key:", err);
  throw err;
}

// -------------------- INIT FIREBASE --------------------
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// -------------------- FUNCTIONS --------------------
export async function saveMessage(sessionId, question, answer) {
  await db.collection("messages").add({
    sessionId,
    question,
    answer,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("💾 Message saved to Firestore");
}

export async function getMessages(sessionId) {
  const snapshot = await db
    .collection("messages")
    .where("sessionId", "==", sessionId)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => doc.data());
}

console.log("✅ Firebase connected successfully");
