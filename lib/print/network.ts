import net from "net";

const DEFAULT_TIMEOUT_MS = 10_000;
const WRITE_CHUNK_BYTES = 4096;
const CONNECT_SETTLE_MS = 120;
const POST_END_GRACE_MS = 100;
const AFTER_WAKE_MS = 200;
const RETRY_DELAY_MS = 300;
const MAX_ATTEMPTS = 3;

/**
 * Same idea as a quick `nc` open+write on :9100.
 * Visible test text is omitted so wake does not waste paper; ESC @ + LF is enough.
 * Cheap ESC/POS units often accept TCP (UI shows success) while asleep and ignore
 * the job until a short raw connection wakes them. Ping can still succeed.
 */
const WAKE_BYTES = Buffer.from([0x0a, 0x0a, 0x1b, 0x40, 0x0a, 0x0a]);

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
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    socket.end(finish);
    setTimeout(finish, 1500);
  });
}

async function sendRaw({
  host,
  port,
  buffer,
  timeoutMs,
}: {
  host: string;
  port: number;
  buffer: Buffer;
  timeoutMs: number;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      try {
        socket.removeAllListeners();
        if (!socket.destroyed) socket.destroy();
      } catch {
        // ignore
      }
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.setNoDelay(true);
    socket.setKeepAlive(false);

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
          await sleep(CONNECT_SETTLE_MS);
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

/** Dedicated short connection — mirrors the manual `nc` wake that fixes idle printers. */
async function wakePrinter(host: string, port: number): Promise<void> {
  await sendRaw({
    host,
    port,
    buffer: WAKE_BYTES,
    timeoutMs: 5_000,
  });
  await sleep(AFTER_WAKE_MS);
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

  const job = Buffer.from(data);
  // Prepend ESC @ so the real job also re-inits after wake.
  const buffer = Buffer.concat([Buffer.from([0x1b, 0x40, 0x0a]), job]);
  const effectiveTimeout = timeoutMs ?? timeoutForPayload(buffer.length);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Always wake first: ping can work while port 9100 is "asleep"
      // and Node still gets TCP write success with no paper out.
      try {
        await wakePrinter(cleanedHost, port);
      } catch {
        // Fall through — main job may still succeed if printer just woke.
      }

      await sendRaw({
        host: cleanedHost,
        port,
        buffer,
        timeoutMs: effectiveTimeout,
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
