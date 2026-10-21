import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import { clearReceiptLogoCache } from "@/lib/print/logo";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_LOGO_WIDTH = 1200;
const MAX_LOGO_HEIGHT = 800;
const CUSTOM_LOGO_PATH = path.join(process.cwd(), "data", "receipt-logo.png");
const DEFAULT_LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "receipt-logo.png",
);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function requireAdminResponse(): Promise<Response | null> {
  const session = await getSession();
  if (!session) return Response.json({ error: "غير مصرح" }, { status: 401 });
  if (session.role !== "admin") {
    return Response.json({ error: "غير مصرح" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const logoPath = fs.existsSync(CUSTOM_LOGO_PATH)
    ? CUSTOM_LOGO_PATH
    : DEFAULT_LOGO_PATH;
  if (!fs.existsSync(logoPath)) {
    return new Response("Logo not found", { status: 404 });
  }

  return new Response(fs.readFileSync(logoPath), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const adminError = await requireAdminResponse();
  if (adminError) return adminError;
  if (!hasSameOrigin(request)) {
    return Response.json({ error: "الطلب غير صالح" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
    return Response.json({ error: "صيغة رفع الصورة غير صالحة" }, {
      status: 400,
    });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "حجم الصورة يجب ألا يتجاوز 5 ميغابايت" }, {
      status: 413,
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "صيغة رفع الصورة غير صالحة" }, {
      status: 400,
    });
  }
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "اختر صورة أولاً" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "حجم الصورة يجب ألا يتجاوز 5 ميغابايت" }, {
      status: 413,
    });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return Response.json(
      { error: "الصيغ المدعومة: PNG وJPG وWebP وGIF" },
      { status: 400 },
    );
  }

  const source = Buffer.from(await file.arrayBuffer());
  let image: Awaited<ReturnType<typeof loadImage>>;
  try {
    image = await loadImage(source);
  } catch {
    return Response.json({ error: "ملف الصورة تالف أو غير صالح" }, {
      status: 400,
    });
  }

  if (
    image.width < 1 ||
    image.height < 1 ||
    image.width * image.height > MAX_IMAGE_PIXELS
  ) {
    return Response.json(
      { error: "أبعاد الصورة كبيرة جداً (الحد الأقصى 16 ميغابكسل)" },
      { status: 400 },
    );
  }

  const scale = Math.min(
    1,
    MAX_LOGO_WIDTH / image.width,
    MAX_LOGO_HEIGHT / image.height,
  );
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  const normalizedPng = canvas.toBuffer("image/png");

  const dataDirectory = path.dirname(CUSTOM_LOGO_PATH);
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryPath = path.join(
    dataDirectory,
    `.receipt-logo-${randomUUID()}.tmp`,
  );
  fs.writeFileSync(temporaryPath, normalizedPng, { flag: "wx" });
  try {
    fs.renameSync(temporaryPath, CUSTOM_LOGO_PATH);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  clearReceiptLogoCache();

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const adminError = await requireAdminResponse();
  if (adminError) return adminError;
  if (!hasSameOrigin(request)) {
    return Response.json({ error: "الطلب غير صالح" }, { status: 403 });
  }

  if (fs.existsSync(CUSTOM_LOGO_PATH)) {
    fs.unlinkSync(CUSTOM_LOGO_PATH);
  }
  clearReceiptLogoCache();
  return Response.json({ ok: true });
}
