import { createApp } from "./app.js";
import { env } from "./lib/env.js";

// TEMP: diagnóstico de crash-loop em produção — reverter depois.
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});
console.log("DEBUG process.env.PORT =", process.env.PORT);

const app = createApp();

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`API rodando em http://0.0.0.0:${env.PORT}`);
});
