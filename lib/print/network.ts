import net from "net";

const DEFAULT_TIMEOUT_MS = 5000;

export async function printToPrinter({
  host,
  port,
  data,
  timeoutMs = DEFAULT_TIMEOUT_MS,
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

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      socket.write(Buffer.from(data), (writeError) => {
        if (writeError) {
          finish(
            new Error(
              `تعذر إرسال البيانات للطابعة ${cleanedHost}:${port}`,
            ),
          );
          return;
        }
        // Give the printer a brief moment, then close
        socket.end(() => finish());
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
