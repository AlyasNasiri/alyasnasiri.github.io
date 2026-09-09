/**
 * Browser client for the bounded local text engine worker.
 *
 * Heavy packet, search, and comparison calls return promises. Validation and
 * small editor helpers remain direct exports from engine.mjs.
 */

export {
  MAX_DOCUMENTS,
  MAX_RESULTS,
  MAX_TEXT_BYTES,
  decodeUtf8,
  deletePreviousGrapheme,
  findNext,
  replaceAll,
  replaceRange,
  validateText,
} from "./engine.mjs";

const DEADLINE_MS = 30_000;
const MAX_QUEUED = 2;
let worker = null;
let workerReady = false;
let startupTimer = null;
let active = null;
const queue = [];
let nextTaskId = 1;

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function clearStartupTimer() {
  if (startupTimer !== null) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
}

function settle(task, outcome, value) {
  if (!task || task.settled) return;
  task.settled = true;
  clearTimeout(task.timer);
  if (outcome === "resolve") task.resolve(value);
  else task.reject(new Error(value));
}

function failWorker(message) {
  clearStartupTimer();
  const failedWorker = worker;
  worker = null;
  workerReady = false;
  if (failedWorker) failedWorker.terminate();
  const pending = active ? [active, ...queue] : [...queue];
  active = null;
  queue.length = 0;
  for (const task of pending) settle(task, "reject", message);
}

function postActive() {
  if (!active || active.sent || !workerReady || !worker) return;
  try {
    active.sent = true;
    worker.postMessage({ type: "request", id: active.id, method: active.method, args: active.args });
  } catch (error) {
    const task = active;
    active = null;
    settle(task, "reject", errorMessage(error, "Text-engine request could not be sent."));
    pump();
  }
}

function pump() {
  if (active) {
    postActive();
    return;
  }
  const task = queue.shift();
  if (!task) return;
  active = task;
  postActive();
}

function startWorker() {
  if (worker) return;
  try {
    worker = new Worker(new URL("./engine-worker.mjs", import.meta.url), { type: "module" });
  } catch (error) {
    failWorker(errorMessage(error, "Text-engine worker could not start."));
    return;
  }
  worker.addEventListener("message", ({ data }) => {
    if (!data || typeof data.type !== "string") return;
    if (data.type === "ready") {
      workerReady = true;
      clearStartupTimer();
      pump();
      return;
    }
    if (!active || data.id !== active.id) return;
    const task = active;
    active = null;
    if (data.type === "result") settle(task, "resolve", data.result);
    else if (data.type === "error") settle(task, "reject", typeof data.message === "string" ? data.message : "Text-engine operation failed.");
    else {
      active = task;
      return;
    }
    pump();
  });
  worker.addEventListener("error", (event) => {
    failWorker(event.message || "Text-engine worker failed.");
  });
  worker.addEventListener("messageerror", () => {
    failWorker("Text-engine worker returned an unreadable result.");
  });
  startupTimer = setTimeout(() => {
    failWorker("Text-engine worker did not start within 30 seconds.");
  }, DEADLINE_MS);
}

function request(method, args) {
  if (active && queue.length >= MAX_QUEUED) {
    return Promise.reject(new Error("Text engine is busy; wait for the current requests to finish."));
  }
  return new Promise((resolve, reject) => {
    const task = {
      id: nextTaskId++,
      method,
      args,
      resolve,
      reject,
      settled: false,
      sent: false,
      timer: null,
    };
    task.timer = setTimeout(() => {
      failWorker("Text-engine operation exceeded the 30-second deadline.");
    }, DEADLINE_MS);
    queue.push(task);
    startWorker();
    pump();
  });
}

export function parseText(text) {
  return request("parseText", [text]);
}

export function reconstructPacket(packet) {
  return request("reconstructPacket", [packet]);
}

export function searchDocuments(documents, query, options) {
  return request("searchDocuments", options === undefined ? [documents, query] : [documents, query, options]);
}

export function compareTexts(left, right) {
  return request("compareTexts", [left, right]);
}
