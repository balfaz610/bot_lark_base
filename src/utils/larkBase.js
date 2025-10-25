import lark from "@larksuiteoapi/node-sdk";
import dotenv from "dotenv";
dotenv.config();

// ====================================================
// 🔹 INIT LARK CLIENT
// ====================================================
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

// ====================================================
// 🔹 Fungsi Ambil Data dari Banyak Tabel
// ====================================================
export async function getBaseData() {
  const appToken = process.env.LARK_APP_TOKEN;

  // daftar tabel berdasarkan ENV yang tersedia
  const tableConfigs = Object.entries(process.env)
    .filter(([key]) => key.startsWith("LARK_TABLE_") && key.endsWith("_ID"))
    .map(([key, value]) => ({
      name: key.replace("LARK_TABLE_", "").replace("_ID", "").toLowerCase(),
      tableId: value,
    }));

  const result = {};

  for (const { name, tableId } of tableConfigs) {
    try {
      const res = await client.bitable.appTableRecord.list({
        path: { app_token: appToken, table_id: tableId },
      });

      const records = res.data?.items?.map((item) => item.fields) || [];
      const columns = records.length ? Object.keys(records[0]) : [];

      result[name] = { columns, records };
      console.log(`✅ Loaded tabel ${name}: ${records.length} record`);
    } catch (err) {
      console.error(`❌ Gagal ambil data tabel ${name}:`, err.response?.data || err.message);
    }
  }

  return result;
}
