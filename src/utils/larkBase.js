import axios from "axios";

export async function getBaseData() {
  try {
    // 🔹 Ambil tenant access token dari Lark API
    const authRes = await axios.post(
      "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
      {
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }
    );

    const tenantToken = authRes.data.tenant_access_token;

    // 🔹 Ambil data dari tabel Lark Base
    const res = await axios.get(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records`,
      {
        headers: {
          Authorization: `Bearer ${tenantToken}`,
        },
      }
    );

    const records = res.data?.data?.items?.map((item) => item.fields) || [];
    const columns = records.length > 0 ? Object.keys(records[0]) : [];

    return { columns, records };
  } catch (err) {
    console.error("❌ Gagal ambil data Lark Base:", err.response?.data || err.message);
    return { columns: [], records: [] };
  }
}
