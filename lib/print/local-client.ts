const DEFAULT_AGENT_URL = "http://127.0.0.1:9288";
const BRIDGE_URL = `${DEFAULT_AGENT_URL}/bridge`;

type BridgeResult = { ok?: boolean; error?: string; printer?: string | null };

let bridgeWindow: Window | null = null;
let bridgeReady = false;
let bridgeConnectPromise: Promise<void> | null = null;

function resetBridge() {
  bridgeReady = false;
  bridgeWindow = null;
  bridgeConnectPromise = null;
}

function isBridgeOpen() {
  return bridgeReady && bridgeWindow !== null && !bridgeWindow.closed;
}

function bridgeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Bridge failed";
  if (message.includes("Popup blocked")) {
    return "المتصفح منع نافذة USB — اسمح بالنوافذ المنبثقة لهذا الموقع";
  }
  if (message.includes("timeout") || message.includes("Timeout")) {
    return "تعذر الاتصال بوكيل USB — شغّل SETUP.bat ثم اضغط ربط الطابعة";
  }
  return message;
}

export function connectLocalPrintBridge(): Promise<
  { ok: true } | { error: string }
> {
  if (isBridgeOpen()) {
    return Promise.resolve({ ok: true });
  }

  if (bridgeConnectPromise) {
    return bridgeConnectPromise
      .then(() => ({ ok: true as const }))
      .catch((error) => ({ error: bridgeErrorMessage(error) }));
  }

  bridgeConnectPromise = new Promise<void>((resolve, reject) => {
    const popup = window.open(
      BRIDGE_URL,
      "fastpos-print-bridge",
      "popup=yes,width=320,height=180",
    );

    if (!popup) {
      reject(new Error("Popup blocked"));
      return;
    }

    bridgeWindow = popup;

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Bridge timeout"));
    }, 10000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== popup) return;

      if (event.data?.type === "fastpos-bridge-ready") {
        bridgeReady = true;
        cleanup();
        resolve();
        return;
      }

      if (event.data?.type === "fastpos-bridge-error") {
        cleanup();
        reject(new Error(event.data.error ?? "Bridge error"));
      }
    }

    window.addEventListener("message", onMessage);
  });

  return bridgeConnectPromise
    .then(() => ({ ok: true as const }))
    .catch((error) => {
      resetBridge();
      return { error: bridgeErrorMessage(error) };
    });
}

function bridgeCall(
  type: "fastpos-health" | "fastpos-print",
  payload?: { data: string; printerName?: string },
): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    if (!isBridgeOpen() || !bridgeWindow) {
      reject(new Error("Bridge not connected"));
      return;
    }

    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Bridge request timeout"));
    }, 45000);

    function onMessage(event: MessageEvent) {
      if (event.source !== bridgeWindow) return;
      const resultType =
        type === "fastpos-health"
          ? "fastpos-health-result"
          : "fastpos-print-result";
      if (event.data?.type !== resultType || event.data?.id !== id) return;

      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);

      if (event.data.error) {
        reject(new Error(String(event.data.error)));
        return;
      }

      resolve(event.data as BridgeResult);
    }

    window.addEventListener("message", onMessage);
    bridgeWindow.postMessage({ type, id, payload }, "*");
  });
}

export async function checkLocalPrintAgent(
  agentUrl = DEFAULT_AGENT_URL,
): Promise<boolean> {
  if (isBridgeOpen()) {
    try {
      const result = await bridgeCall("fastpos-health");
      return result.ok === true;
    } catch {
      resetBridge();
    }
  }

  try {
    const response = await fetch(`${agentUrl}/health`, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { ok?: boolean };
    return payload.ok === true;
  } catch {
    return false;
  }
}

export async function printViaLocalAgent({
  data,
  printerName,
  agentUrl = DEFAULT_AGENT_URL,
}: {
  data: string;
  printerName?: string;
  agentUrl?: string;
}): Promise<{ ok: true } | { error: string }> {
  void agentUrl;

  if (!isBridgeOpen()) {
    const connected = await connectLocalPrintBridge();
    if ("error" in connected) {
      return connected;
    }
  }

  try {
    const result = await bridgeCall("fastpos-print", { data, printerName });
    if (result.error) {
      return { error: result.error };
    }
    return { ok: true };
  } catch (error) {
    resetBridge();
    return { error: bridgeErrorMessage(error) };
  }
}
