import { deflateSync } from "node:zlib";

/** 80 mm receipt width in PostScript points. */
export const PDF_PAGE_WIDTH_PT = (80 / 25.4) * 72;

export type PdfImagePage = {
  width: number;
  height: number;
  rgb: Uint8Array;
};

export function pageHeightPt(width: number, height: number): number {
  return (height * PDF_PAGE_WIDTH_PT) / width;
}

function pdfNumber(value: number): string {
  return value.toFixed(2);
}

/**
 * Wraps one top-down RGB bitmap in a single-page PDF whose page is 80 mm wide.
 * Pixels are stored as a Flate-decoded image, so Arabic shaping done by the
 * canvas survives without font embedding.
 */
export function imagePdf(page: PdfImagePage): Uint8Array {
  if (page.width <= 0 || page.height <= 0) {
    throw new Error("PDF image requires a positive width and height");
  }
  const expected = page.width * page.height * 3;
  if (page.rgb.length !== expected) {
    throw new Error(
      `PDF image pixel data is ${page.rgb.length} bytes, expected ${expected}`,
    );
  }

  const pageWidth = pdfNumber(PDF_PAGE_WIDTH_PT);
  const pageHeight = pdfNumber(pageHeightPt(page.width, page.height));
  const image = deflateSync(page.rgb);
  const content = deflateSync(
    Buffer.from(
      `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`,
      "latin1",
    ),
  );

  const objects: Array<{ head: string; stream?: Uint8Array }> = [
    { head: "<< /Type /Catalog /Pages 2 0 R >>" },
    { head: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      head:
        `<< /Type /Page /Parent 2 0 R ` +
        `/MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    },
    {
      head: `<< /Length ${content.length} /Filter /FlateDecode >>`,
      stream: content,
    },
    {
      head:
        `<< /Type /XObject /Subtype /Image /Width ${page.width} ` +
        `/Height ${page.height} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>`,
      stream: image,
    },
  ];

  const chunks: Buffer[] = [
    Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1"),
  ];
  let offset = chunks[0]!.length;
  const offsets: number[] = [];

  objects.forEach((object, index) => {
    offsets.push(offset);
    const parts = [
      Buffer.from(`${index + 1} 0 obj\n${object.head}\n`, "latin1"),
    ];
    if (object.stream) {
      parts.push(
        Buffer.from("stream\n", "latin1"),
        Buffer.from(object.stream),
        Buffer.from("\nendstream\n", "latin1"),
      );
    }
    parts.push(Buffer.from("endobj\n", "latin1"));
    for (const part of parts) {
      chunks.push(part);
      offset += part.length;
    }
  });

  const xrefOffset = offset;
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  chunks.push(Buffer.from(xref, "latin1"));

  return new Uint8Array(Buffer.concat(chunks));
}
