const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  try {
    const kecamatan = event.queryStringParameters?.kecamatan;
    if (!kecamatan) return { statusCode:400, headers, body:JSON.stringify({success:false,message:"Parameter kecamatan wajib diisi."}) };
    const response = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/villages/${encodeURIComponent(kecamatan)}.json`);
    if (!response.ok) throw new Error(`Wilayah API HTTP ${response.status}`);
    const data = await response.json();
    return { statusCode:200, headers, body:JSON.stringify({success:true,data,options:'<option value="">Pilih Desa / Kelurahan</option>'+data.map(x=>`<option value="${x.id}">${x.name}</option>`).join("")}) };
  } catch(err) {
    return { statusCode:502, headers, body:JSON.stringify({success:false,message:err.message}) };
  }
};
