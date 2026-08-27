// Optional local smoke test for the handler.
// Run after installing project dependencies if needed.
const { handler } = require("./netlify/functions/biteship-webhook");

(async () => {
  const result = await handler({
    httpMethod: "POST",
    headers: { "content-type": "application/json" },
    body: "",
    isBase64Encoded: false
  });

  console.log(result);
  if (result.statusCode !== 200 || result.body !== "ok") {
    process.exit(1);
  }
  console.log("PASS: Biteship empty-body validation = HTTP 200 ok");
})();
