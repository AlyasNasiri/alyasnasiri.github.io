import { compareTexts, parseText, reconstructPacket, searchDocuments } from "./engine.mjs";

const operations = Object.freeze({ compareTexts, parseText, reconstructPacket, searchDocuments });

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

self.addEventListener("message", async ({ data }) => {
  if (!data || data.type !== "request" || !Number.isSafeInteger(data.id) || typeof data.method !== "string" || !Array.isArray(data.args)) {
    return;
  }
  if (!Object.hasOwn(operations, data.method)) {
    self.postMessage({ type: "error", id: data.id, message: "Unsupported text-engine operation." });
    return;
  }
  const operation = operations[data.method];
  try {
    const result = await operation(...data.args);
    self.postMessage({ type: "result", id: data.id, result });
  } catch (error) {
    self.postMessage({ type: "error", id: data.id, message: errorMessage(error) });
  }
});

self.postMessage({ type: "ready" });
