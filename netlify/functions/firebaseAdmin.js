const admin = require("firebase-admin");

function getFirebaseAdmin() {
  if (admin.apps.length) return admin;

  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  let credential;

  if (raw) {
    const serviceAccount = JSON.parse(raw);
    credential = admin.credential.cert({
      projectId: serviceAccount.project_id || serviceAccount.projectId,
      clientEmail: serviceAccount.client_email || serviceAccount.clientEmail,
      privateKey: String(serviceAccount.private_key || serviceAccount.privateKey || "").replace(/\\n/g, "\n")
    });
  } else {
    const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
    const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
    const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Firebase Admin belum dikonfigurasi. Isi FIREBASE_SERVICE_ACCOUNT_JSON di Netlify.");
    }
    credential = admin.credential.cert({ projectId, clientEmail, privateKey });
  }

  admin.initializeApp({
    credential,
    databaseURL: String(
      process.env.FIREBASE_DATABASE_URL ||
      "https://subur-mujur-tani-6ff54-default-rtdb.asia-southeast1.firebasedatabase.app"
    ).trim()
  });

  return admin;
}

module.exports = { getFirebaseAdmin };
