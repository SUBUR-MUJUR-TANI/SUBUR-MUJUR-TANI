exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ success:false, message:"Method harus POST." }) };
  try {
    const { waybill_id, courier_code } = JSON.parse(event.body || "{}");
    const apiKey = process.env.BINDERBYTE_API_KEY;
    const awb = String(waybill_id || "").trim();
    const courier = String(courier_code || "").trim().toLowerCase();
    if (!apiKey) return { statusCode:500, headers, body:JSON.stringify({success:false,message:"BINDERBYTE_API_KEY belum diatur di Netlify Environment Variables."}) };
    if (!awb || !courier) return { statusCode:400, headers, body:JSON.stringify({success:false,message:"Nomor resi dan kurir wajib diisi."}) };
    const url = new URL("https://api.binderbyte.com/v1/track");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("courier", courier);
    url.searchParams.set("awb", awb);
    const response = await fetch(url);
    const result = await response.json();
    if (!response.ok || Number(result.status) !== 200) return { statusCode: response.status || 400, headers, body:JSON.stringify({success:false,message:result.message || "BinderByte gagal melacak resi.", binderbyte:result}) };
    return { statusCode:200, headers, body:JSON.stringify({success:true,data:result.data,summary:result.data?.summary,detail:result.data?.detail,history:result.data?.history}) };
  } catch (err) {
    return { statusCode:500, headers, body:JSON.stringify({success:false,message:err.message || "Terjadi kesalahan pada server lacak resi."}) };
  }
};
