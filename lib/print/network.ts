import net from "net";

const DEFAULT_TIMEOUT_MS = 10_000;
const WRITE_CHUNK_BYTES = 4096;
const CONNECT_SETTLE_MS = 80;
const POST_END_GRACE_MS = 60;
const RETRY_DELAY_MS = 250;
const MAX_ATTEMPTS = 3;

/** ESC @ — re-init printer (same wake-up effect as a quick nc probe). */
const WAKE_BYTES = Buffer.from([0x1b, 0x40, 0x0a, 0x0a]);

function timeoutForPayload(byteLength: number) {
  return DEFAULT_TIMEOUT_MS + Math.ceil(byteLength / WRITE_CHUNK_BYTES) * 1500;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function writeBuffer(socket: net.Socket, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    let offset = 0;
    let writing = false;

    const writeNext = () => {
      if (writing) return;
      if (offset >= buffer.length) {
        resolve();
        return;
      }

      const chunk = buffer.subarray(
        offset,
        Math.min(offset + WRITE_CHUNK_BYTES, buffer.length),
      );
      offset += chunk.length;
      writing = true;

      const canContinue = socket.write(chunk, (error) => {
        writing = false;
        if (error) {
          reject(error);
          return;
        }
        writeNext();
      });

      if (!canContinue) {
        socket.once("drain", () => {
          writing = false;
          writeNext();
        });
      }
    };

    writeNext();
  });
}

function endSocket(socket: net.Socket): Promise<void> {
  return new Promise((resolve) => {
    socket.end(() => resolve());
    // Some firmwares never ACK FIN cleanly — don't hang forever.
    setTimeout(resolve, 1500);
  });
}

async function printOnce({
  host,
  port,
  buffer,
  timeoutMs,
  wakeFirst,
}: {
  host: string;
  port: number;
  buffer: Buffer;
  timeoutMs: number;
  wakeFirst: boolean;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      try {
        socket.removeAllListeners();
        socket.destroy();
      } catch {
        // ignore
      }
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 1000);

    socket.once("timeout", () => {
      finish(
        new Error(
          `انتهت مهلة الاتصال بالطابعة ${host}:${port} — تحقق من الشبكة والورقة`,
        ),
      );
    });

    socket.once("error", (err) => {
      finish(
        new Error(`تعذر الاتصال بالطابعة ${host}:${port} — ${err.message}`),
      );
    });

    socket.once("connect", () => {
      void (async () => {
        try {
          // Give sleepy thermal printers a moment after TCP accept.
          await sleep(CONNECT_SETTLE_MS);
          if (wakeFirst) {
            await writeBuffer(socket, WAKE_BYTES);
            await sleep(CONNECT_SETTLE_MS);
          }
          await writeBuffer(socket, buffer);
          await endSocket(socket);
          await sleep(POST_END_GRACE_MS);
          finish();
        } catch (writeError) {
          finish(
            writeError instanceof Error
              ? writeError
              : new Error(`تعذر إرسال البيانات للطابعة ${host}:${port}`),
          );
        }
      })();
    });

    try {
      socket.connect(port, host);
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error(`تعذر الاتصال بالطابعة ${host}:${port}`),
      );
    }
  });
}

export async function printToPrinter({
  host,
  port,
  data,
  timeoutMs,
}: {
  host: string;
  port: number;
  data: Uint8Array;
  timeoutMs?: number;
}): Promise<void> {
  const cleanedHost = host.trim();
  if (!cleanedHost) {
    throw new Error("عنوان الطابعة غير صالح");
  }

  const buffer = Buffer.from(data);
  const effectiveTimeout = timeoutMs ?? timeoutForPayload(buffer.length);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await printOnce({
        host: cleanedHost,
        port,
        buffer,
        timeoutMs: effectiveTimeout,
        // First try: send job as-is. Retries: wake probe (like your nc test).
        wakeFirst: attempt > 1,
      });
      return;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(`تعذر الاتصال بالطابعة ${cleanedHost}:${port}`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError ?? new Error(`تعذر الاتصال بالطابعة ${cleanedHost}:${port}`);
}
