export type ReceiptLine = {
  name: string;
  qty: number;
  unitPrice?: number;
  lineTotal?: number;
};

export type ReportSummaryPrintData = {
  venueName: string;
  fromLabel: string;
  toLabel: string;
  printedAt: string;
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  cardTotal: number;
  totalItems: number;
  tableSales: number;
  quickSales: number;
  cancelledCount: number;
  openCount: number;
  openTotal: number;
  categorySales: Array<{ name: string; qty: number; revenue: number }>;
  itemSales: Array<{ name: string; qty: number; revenue: number }>;
  waiterPerformance: Array<{ name: string; invoices: number; sales: number }>;
  cashierPerformance: Array<{
    name: string;
    invoices: number;
    cash: number;
    card: number;
    sales: number;
  }>;
};

export type ShiftReportPrintData = {
  kind: "X" | "Z";
  venueName: string;
  workDate: string;
  periodFrom: string;
  periodTo: string;
  printedByName: string;
  invoiceCount: number;
  totalSales: number;
  cashTotal: number;
  cardTotal: number;
  totalItems: number;
  tableSales: number;
  quickSales: number;
  groups: Array<{ name: string; qty: number; revenue: number }>;
};

export type KitchenReceiptData = {
  venueName: string;
  orderId: number;
  tableName: string;
  waiterName: string;
  createdAt: string;
  lines: ReceiptLine[];
  /** e.g. "2/3" when order is split across multiple kitchen tickets */
  ticketPart?: string;
};

export type CheckoutReceiptData = {
  venueName: string;
  orderId: number;
  tableName: string;
  waiterName: string | null;
  cashierName: string;
  paymentMethod: "cash" | "card" | "preview";
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
  <meta name="viewport" content="width=72mm" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      width: 72mm;
      max-width: 72mm;
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
    }

    body {
      font-family: Tahoma, Arial, "Segoe UI", sans-serif;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.4;
      direction: rtl;
      text-align: right;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .wrap {
      width: 72mm;
      max-width: 72mm;
      padding: 1mm 1.5mm 2mm;
    }

    .center {
      text-align: center;
    }

    .logo {
      display: block;
      width: 38mm;
      max-width: 100%;
      height: auto;
      margin: 0 auto 2mm;
    }

    .brand {
      margin: 0;
      font-size: 18px;
      font-weight: 900;
      line-height: 1.2;
      text-align: right;
      color: #000;
    }

    .subtitle {
      margin: 1.5mm 0 0;
      font-size: 15px;
      font-weight: 900;
      text-align: right;
      color: #000;
    }

    .cashier-banner {
      margin: 2mm 0 0;
      padding: 1.5mm 0;
      font-size: 14px;
      font-weight: 900;
      color: #000;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    }

    .divider {
      border: 0;
      border-top: 1px dashed #000;
      margin: 2.5mm 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .meta td {
      padding: 0.8mm 0;
      vertical-align: top;
      font-size: 13px;
      color: #000;
    }

    .meta .label {
      width: 36%;
      font-weight: 800;
    }

    .meta .value {
      width: 64%;
      font-weight: 900;
      text-align: left;
      word-break: break-word;
    }

    .items thead td {
      padding-bottom: 1mm;
      font-size: 12px;
      font-weight: 900;
      color: #000;
      border-bottom: 2px solid #000;
    }

    .items tbody td {
      padding: 1.2mm 0;
      vertical-align: top;
      font-size: 13px;
      color: #000;
    }

    .items .name {
      font-size: 16px;
      font-weight: 900;
      line-height: 1.35;
      text-align: right;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .items .qty {
      width: 10mm;
      text-align: center;
      font-weight: 900;
      white-space: nowrap;
    }

    .items .price {
      width: 18mm;
      text-align: left;
      font-weight: 900;
      white-space: nowrap;
      font-size: 12px;
    }

    .items .sub {
      display: block;
      margin-top: 0.5mm;
      font-size: 11px;
      font-weight: 800;
      color: #000;
    }

    .total-row td {
      padding-top: 2mm;
      font-size: 17px;
      font-weight: 900;
      color: #000;
    }

    .total-row .label {
      text-align: right;
    }

    .total-row .value {
      text-align: left;
      white-space: nowrap;
    }

    .foot {
      margin: 2.5mm 0 0;
      font-size: 12px;
      font-weight: 800;
      line-height: 1.45;
      text-align: center;
      color: #000;
    }

    .kitchen-qty {
      width: 12mm;
      font-size: 18px;
      font-weight: 900;
      text-align: left;
      white-space: nowrap;
      color: #000;
    }

    @media print {
      html, body, .wrap {
        width: 72mm !important;
        max-width: 72mm !important;
      }

      body {
        margin: 0 auto !important;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">${body}</div>
</body>
</html>`;
}

export function buildKitchenReceiptHtml(data: KitchenReceiptData) {
  const partTag = data.ticketPart ? ` ${escapeHtml(data.ticketPart)}` : "";
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
    `طلب مطبخ #${data.orderId}`,
    `
    <p class="brand">#${data.orderId}${partTag} · ${escapeHtml(data.tableName)}</p>
    <p class="subtitle">${escapeHtml(data.createdAt)} · ${escapeHtml(data.waiterName)}</p>
    <hr class="divider" />
    <table class="items">
      <tbody>${lines}</tbody>
    </table>
  `,
  );
}

export function buildCheckoutReceiptHtml(
  data: CheckoutReceiptData,
  logoDataUrl?: string | null,
) {
  const method =
    data.paymentMethod === "preview"
      ? "غير مدفوعة"
      : data.paymentMethod === "cash"
        ? "نقداً"
        : "بطاقة";
  const logoHtml = logoDataUrl
    ? `<img class="logo" src="${logoDataUrl}" alt="الشعار" />`
    : "";
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
    `إيصال ${data.orderId > 0 ? `رقم ${data.orderId}` : "للعرض"}`,
    `
    <div class="center">
      ${logoHtml}
      <p class="brand">${escapeHtml(data.venueName)}</p>
      <p class="subtitle">إيصال الدفع</p>
      <p class="cashier-banner">الكاشير: ${escapeHtml(data.cashierName)}</p>
    </div>
    <hr class="divider" />
    <table class="meta">
      ${metaRow("رقم الفاتورة", data.orderId > 0 ? `#${data.orderId}` : "—")}
      ${metaRow("الطاولة", data.tableName)}
      ${data.waiterName ? metaRow("السفرادجي", data.waiterName) : ""}
      ${metaRow("طريقة الدفع", method)}
      ${metaRow("الوقت", data.paidAt)}
    </table>
    <hr class="divider" />
    <table class="items">
      <thead>
        <tr>
          <td>الصنف</td>
          <td style="text-align:center;width:10mm">كم</td>
          <td style="text-align:left;width:18mm">المبلغ</td>
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
    iframe.style.width = "72mm";
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
