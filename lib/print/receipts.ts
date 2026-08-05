export type ReceiptLine = {
  name: string;
  qty: number;
  unitPrice?: number;
  lineTotal?: number;
};

export type KitchenReceiptData = {
  venueName: string;
  orderId: number;
  tableName: string;
  waiterName: string;
  createdAt: string;
  lines: ReceiptLine[];
};

export type CheckoutReceiptData = {
  venueName: string;
  orderId: number;
  tableName: string;
  waiterName: string | null;
  cashierName: string;
  paymentMethod: "cash" | "card";
  paidAt: string;
  total: number;
  lines: Array<ReceiptLine & { unitPrice: number; lineTotal: number }>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(amount: number) {
  return `${amount.toFixed(2)} د.ل`;
}

function shell(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Cairo, Tahoma, Arial, sans-serif;
      font-size: 13px;
      color: #000;
      width: 72mm;
    }
    .wrap { padding: 2mm; }
    .center { text-align: center; }
    .bold { font-weight: 800; }
    .title { font-size: 18px; font-weight: 900; margin: 0 0 4px; }
    .muted { font-size: 11px; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
    .line { border-top: 1px dashed #000; margin: 8px 0; }
    .item { margin: 6px 0; }
    .item-name { font-weight: 800; }
    .big { font-size: 16px; font-weight: 900; }
    .qty { font-size: 20px; font-weight: 900; }
    .foot { margin-top: 10px; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">${body}</div>
</body>
</html>`;
}

export function buildKitchenReceiptHtml(data: KitchenReceiptData) {
  const lines = data.lines
    .map(
      (line) => `
      <div class="item">
        <div class="row">
          <span class="item-name">${escapeHtml(line.name)}</span>
          <span class="qty">x${line.qty}</span>
        </div>
      </div>`,
    )
    .join("");

  return shell(
    `مطبخ #${data.orderId}`,
    `
    <div class="center">
      <p class="title">طلب المطبخ</p>
      <p class="bold">${escapeHtml(data.venueName)}</p>
    </div>
    <div class="line"></div>
    <div class="row"><span>فاتورة</span><span class="bold">#${data.orderId}</span></div>
    <div class="row"><span>الطاولة</span><span class="bold">${escapeHtml(data.tableName)}</span></div>
    <div class="row"><span>السفرادجي</span><span class="bold">${escapeHtml(data.waiterName)}</span></div>
    <div class="row"><span>الوقت</span><span>${escapeHtml(data.createdAt)}</span></div>
    <div class="line"></div>
    ${lines}
    <div class="line"></div>
    <p class="foot">أرسل للمطبخ — يرجى التحضير</p>
  `,
  );
}

export function buildCheckoutReceiptHtml(data: CheckoutReceiptData) {
  const method = data.paymentMethod === "cash" ? "نقدي" : "بطاقة";
  const lines = data.lines
    .map(
      (line) => `
      <div class="item">
        <div class="row">
          <span class="item-name">${escapeHtml(line.name)}</span>
          <span>x${line.qty}</span>
        </div>
        <div class="row muted">
          <span>${money(line.unitPrice)}</span>
          <span class="bold">${money(line.lineTotal)}</span>
        </div>
      </div>`,
    )
    .join("");

  return shell(
    `إيصال #${data.orderId}`,
    `
    <div class="center">
      <p class="title">${escapeHtml(data.venueName)}</p>
      <p class="bold">إيصال الدفع</p>
    </div>
    <div class="line"></div>
    <div class="row"><span>فاتورة</span><span class="bold">#${data.orderId}</span></div>
    <div class="row"><span>الطاولة</span><span class="bold">${escapeHtml(data.tableName)}</span></div>
    ${
      data.waiterName
        ? `<div class="row"><span>السفرادجي</span><span>${escapeHtml(data.waiterName)}</span></div>`
        : ""
    }
    <div class="row"><span>الكاشير</span><span>${escapeHtml(data.cashierName)}</span></div>
    <div class="row"><span>الدفع</span><span class="bold">${method}</span></div>
    <div class="row"><span>الوقت</span><span>${escapeHtml(data.paidAt)}</span></div>
    <div class="line"></div>
    ${lines}
    <div class="line"></div>
    <div class="row big">
      <span>الإجمالي</span>
      <span>${money(data.total)}</span>
    </div>
    <p class="foot">شكراً لزيارتكم</p>
  `,
  );
}

export function printHtmlReceipt(html: string) {
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      reject(new Error("تعذر فتح نافذة الطباعة"));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      iframe.remove();
      resolve();
    };

    win.onafterprint = cleanup;

    // Give the browser a moment to layout thermal content
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
        // Fallback cleanup if onafterprint never fires
        window.setTimeout(cleanup, 1500);
      } catch (error) {
        iframe.remove();
        reject(error);
      }
    }, 250);
  });
}
