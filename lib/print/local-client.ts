const DEFAULT_AGENT_URL = "http://127.0.0.1:9288";

export async function printViaLocalAgent({
  data,
  printerName,
  agentUrl = DEFAULT_AGENT_URL,
}: {
  data: string;
  printerName?: string;
  agentUrl?: string;
}): Promise<{ ok: true } | { error: string }> {
  try {
    const response = await fetch(`${agentUrl}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, printerName }),
    });

    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || payload.error) {
      return {
        error: payload.error ?? "تعذر إرسال الفاتورة للطابعة المحلية",
      };
    }
    return { ok: true };
  } catch {
    return {
      error:
        "تعذر الاتصال بوكيل الطباعة على جهاز الكاشير — شغّل Fast POS Print Agent",
    };
  }
}

export async function checkLocalPrintAgent(
  agentUrl = DEFAULT_AGENT_URL,
): Promise<boolean> {
  try {
    const response = await fetch(`${agentUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
