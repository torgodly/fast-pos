import net from "net";

const DEFAULT_TIMEOUT_MS = 8000;
const WRITE_CHUNK_BYTES = 4096;

function timeoutForPayload(byteLength: number) {
  // Large kitchen tickets need more time to spool
  return DEFAULT_TIMEOUT_MS + Math.ceil(byteLength / WRITE_CHUNK_BYTES) * 1500;
}

function writeBuffer(socket: net.Socket, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    let offset = 0;

    const writeNext = () => {
      if (offset >= buffer.length) {
        resolve();
        return;
      }

      const chunk = buffer.subarray(
        offset,
        Math.min(offset + WRITE_CHUNK_BYTES, buffer.length),
      );
      offset += chunk.length;

      const canContinue = socket.write(chunk, (error) => {
        if (error) {
          reject(error);
          return;
        }
        writeNext();
      });

      if (!canContinue) {
        socket.once("drain", writeNext);
      }
    };

    writeNext();
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

  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(effectiveTimeout);

    socket.once("connect", () => {
      void writeBuffer(socket, buffer)
        .then(() => {
          socket.end(() => finish());
        })
        .catch((writeError) => {
          finish(
            writeError instanceof Error
              ? writeError
              : new Error(
                  `تعذر إرسال البيانات للطابعة ${cleanedHost}:${port}`,
                ),
          );
        });
    });

    socket.once("timeout", () => {
      finish(
        new Error(
          `انتهت مهلة الاتصال بالطابعة ${cleanedHost}:${port} — تحقق من الشبكة والورقة`,
        ),
      );
    });

    socket.once("error", (err) => {
      finish(
        new Error(
          `تعذر الاتصال بالطابعة ${cleanedHost}:${port} — ${err.message}`,
        ),
      );
    });

    try {
      socket.connect(port, cleanedHost);
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error(`تعذر الاتصال بالطابعة ${cleanedHost}:${port}`),
      );
    }
  });
}
