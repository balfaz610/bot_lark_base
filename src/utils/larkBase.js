import axios from "axios";

// ====================================================
// 🔹 Ambil Tenant Access Token dari Lark
// ====================================================
export async function getTenantAccessToken() {
  try {
    const res = await axios.post(
      "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal/",
      {
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      },
      { timeout: 10000 }
    );

    const token = res.data?.tenant_access_token;
    if (!token) throw new Error("Tidak bisa ambil tenant_access_token!");

    return token;
  } catch (err) {
    console.error("❌ Gagal ambil tenant_access_token:", err.response?.data || err.message);
    throw err;
  }
}

// ====================================================
// 🔹 Ambil Data dari Lark Base
// ====================================================
export async function getBaseData() {
  const token = await getTenantAccessToken();
  const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records`;

  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    const records = res.data?.data?.items?.map((r) => r.fields) || [];
    const columns = records.length ? Object.keys(records[0]) : [];

    console.log(`✅ Berhasil ambil ${records.length} data dari Lark Base`);
    return { columns, records };
  } catch (err) {
    console.error("❌ Gagal ambil data Lark Base:", err.response?.data || err.message);
    return { columns: [], records: [] };
  }
}
