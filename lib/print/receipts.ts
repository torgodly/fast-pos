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
  footerMessage?: string;
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

function metaRow(label: string, value: string) {
  return `<tr>
    <td class="label">${escapeHtml(label)}</td>
    <td class="value">${escapeHtml(value)}</td>
  </tr>`;
}

function shell(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=80mm" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet" />
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      width: 80mm;
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
    }

    body {
      font-family: "Cairo", "Segoe UI", Tahoma, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      direction: rtl;
      text-align: right;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .wrap {
      width: 80mm;
      padding: 4mm 3mm 5mm;
    }

    .center {
      text-align: center;
    }

    .logo {
      display: block;
      width: 42mm;
      max-width: 100%;
      height: auto;
      margin: 0 auto 3mm;
    }

    .brand {
      margin: 0;
      font-size: 17px;
      font-weight: 900;
      line-height: 1.25;
    }

    .subtitle {
      margin: 2mm 0 0;
      font-size: 13px;
      font-weight: 700;
    }

    .divider {
      border: 0;
      border-top: 1px dashed #000;
      margin: 3mm 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    .meta td {
      padding: 1mm 0;
      vertical-align: top;
      font-size: 12px;
    }

    .meta .label {
      width: 38%;
      color: #222;
      font-weight: 600;
      white-space: nowrap;
    }

    .meta .value {
      width: 62%;
      font-weight: 800;
      text-align: left;
      word-break: break-word;
    }

    .items thead td {
      padding-bottom: 1.5mm;
      font-size: 11px;
      font-weight: 800;
      border-bottom: 1px solid #000;
    }

    .items tbody td {
      padding: 1.5mm 0;
      vertical-align: top;
      font-size: 12px;
    }

    .items .name {
      font-weight: 700;
      line-height: 1.35;
      word-break: break-word;
    }

    .items .qty {
      width: 12mm;
      text-align: center;
      font-weight: 800;
      white-space: nowrap;
    }

    .items .price {
      width: 22mm;
      text-align: left;
      font-weight: 700;
      white-space: nowrap;
    }

    .items .sub {
      display: block;
      margin-top: 0.5mm;
      font-size: 10px;
      font-weight: 600;
      color: #333;
    }

    .total-row td {
      padding-top: 2mm;
      font-size: 15px;
      font-weight: 900;
    }

    .total-row .label {
      text-align: right;
    }

    .total-row .value {
      text-align: left;
      white-space: nowrap;
    }

    .foot {
      margin: 3mm 0 0;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.5;
      text-align: center;
    }

    .kitchen-qty {
      font-size: 18px;
      font-weight: 900;
      text-align: left;
      white-space: nowrap;
    }
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
      <tr>
        <td class="name">${escapeHtml(line.name)}</td>
        <td class="kitchen-qty">${line.qty}×</td>
      </tr>`,
    )
    .join("");

  return shell(
    `طلب مطبخ رقم ${data.orderId}`,
    `
    <div class="center">
      <p class="brand">طلب المطبخ</p>
      <p class="subtitle">${escapeHtml(data.venueName)}</p>
    </div>
    <hr class="divider" />
    <table class="meta">
      ${metaRow("رقم الفاتورة", `#${data.orderId}`)}
      ${metaRow("الطاولة", data.tableName)}
      ${metaRow("السفرادجي", data.waiterName)}
      ${metaRow("الوقت", data.createdAt)}
    </table>
    <hr class="divider" />
    <table class="items">
      <thead>
        <tr>
          <td>الصنف</td>
          <td style="text-align:center;width:12mm">الكمية</td>
        </tr>
      </thead>
      <tbody>${lines}</tbody>
    </table>
    <hr class="divider" />
    <p class="foot">يُرجى تحضير الطلب — شكراً</p>
  `,
  );
}

export function buildCheckoutReceiptHtml(data: CheckoutReceiptData) {
  const method = data.paymentMethod === "cash" ? "نقداً" : "بطاقة";
  const lines = data.lines
    .map(
      (line) => `
      <tr>
        <td class="name">
          ${escapeHtml(line.name)}
          <span class="sub">${money(line.unitPrice)} للوحدة</span>
        </td>
        <td class="qty">${line.qty}×</td>
        <td class="price">${money(line.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  return shell(
    `إيصال رقم ${data.orderId}`,
    `
    <div class="center">
      <img class="logo" src="/receipt-logo.png" alt="الشعار" />
      <p class="brand">${escapeHtml(data.venueName)}</p>
      <p class="subtitle">إيصال الدفع</p>
    </div>
    <hr class="divider" />
    <table class="meta">
      ${metaRow("رقم الفاتورة", `#${data.orderId}`)}
      ${metaRow("الطاولة", data.tableName)}
      ${data.waiterName ? metaRow("السفرادجي", data.waiterName) : ""}
      ${metaRow("الكاشير", data.cashierName)}
      ${metaRow("طريقة الدفع", method)}
      ${metaRow("الوقت", data.paidAt)}
    </table>
    <hr class="divider" />
    <table class="items">
      <thead>
        <tr>
          <td>الصنف</td>
          <td style="text-align:center;width:12mm">الكمية</td>
          <td style="text-align:left;width:22mm">المبلغ</td>
        </tr>
      </thead>
      <tbody>${lines}</tbody>
    </table>
    <hr class="divider" />
    <table class="total-row">
      <tr>
        <td class="label">الإجمالي</td>
        <td class="value">${money(data.total)}</td>
      </tr>
    </table>
    <p class="foot">${escapeHtml(data.footerMessage?.trim() || "شكراً لزيارتكم")}</p>
  `,
  );
}

function waitForImages(doc: Document) {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

export function printHtmlReceipt(html: string) {
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "80mm";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
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

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      iframe.remove();
      resolve();
    };

    win.onafterprint = cleanup;

    void (async () => {
      try {
        if (doc.fonts?.ready) {
          await doc.fonts.ready;
        }
        await waitForImages(doc);
        await new Promise((r) => window.setTimeout(r, 350));
        win.focus();
        win.print();
        window.setTimeout(cleanup, 3000);
      } catch (error) {
        iframe.remove();
        reject(
          error instanceof Error
            ? error
            : new Error("تعذر طباعة الإيصال"),
        );
      }
    })();
  });
}
