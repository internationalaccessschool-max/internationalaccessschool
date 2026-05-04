/**
 * Fetch the school logo and return it as a base64 data URI so it is
 * embedded in the popup HTML — no separate network request needed at
 * print time, which is why logos disappear without this.
 */
async function logoAsDataURI(): Promise<string> {
    try {
        const res = await fetch(window.location.origin + "/LOGO.png");
        const blob = await res.blob();
        return await new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch {
        return window.location.origin + "/LOGO.png"; // fallback to URL
    }
}

/**
 * printReceiptHTML — Opens a popup with 2 receipt copies on a single A5 landscape sheet.
 * Left half = Student Copy, Right half = Office Copy.
 */
export async function printReceiptHTML(bodyHTML: string, title = "Fee Receipt"): Promise<void> {
    const popup = window.open("", "_blank", "width=700,height=450,scrollbars=yes");
    if (!popup) {
        alert("Please allow popups for this website to print/download receipts.");
        return;
    }

    // Embed logo as base64 so it always renders in print (no network call needed)
    const logoDataURI = await logoAsDataURI();
    const resolvedHTML = bodyHTML.replace(/__SCHOOL_LOGO__/g, logoDataURI);

    const twoCopies = `
<div class="page">
  <div class="slip student-copy">${resolvedHTML}<div class="copy-label">✂ STUDENT COPY</div></div>
  <div class="slip office-copy">${resolvedHTML}<div class="copy-label">✂ OFFICE COPY</div></div>
</div>`;

    popup.document.title = title;
    popup.document.head.innerHTML = `
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; }

    /* === LANDSCAPE (default / horizontal paper) === */
    .page {
      width: 210mm;
      height: 148.5mm;
      margin: 20px auto;
      background: #fff;
      display: flex;
      flex-direction: row;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
    .slip {
      width: 50%;
      height: 100%;
      padding: 6mm 7mm;
      overflow: hidden;
      border-right: 1.5px dashed #94a3b8;
      border-bottom: none;
      position: relative;
    }
    .slip:last-child { border-right: none; }

    /* === PORTRAIT (vertical paper) === */
    @media (orientation: portrait) {
      .page { width: 148.5mm; height: 210mm; flex-direction: column; }
      .slip { width: 100%; height: 50%; border-right: none; border-bottom: 1.5px dashed #94a3b8; }
      .slip:last-child { border-bottom: none; }
    }

    /* Watermark */
    .slip::before {
      content: '';
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 55%; height: 55%;
      background-image: url('${logoDataURI}');
      background-repeat: no-repeat;
      background-position: center;
      background-size: contain;
      opacity: 0.05;
      pointer-events: none;
      z-index: 0;
    }

    .slip > * { position: relative; z-index: 1; }

    .copy-label {
      position: absolute;
      bottom: 2mm;
      right: 3mm;
      font-size: 6.5px;
      font-weight: 800;
      letter-spacing: .1em;
      color: #94a3b8;
      text-transform: uppercase;
      z-index: 2;
    }

    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      body { background: #fff; }
      @page { size: auto; margin: 0; }

      /* Landscape print */
      @media (orientation: landscape) {
        .page { margin: 0; box-shadow: none; width: 210mm; height: 148.5mm; flex-direction: row; }
        .slip { width: 50%; height: 100%; border-right: 1.5px dashed #94a3b8; border-bottom: none; }
        .slip:last-child { border-right: none; border-bottom: none; }
      }

      /* Portrait print */
      @media (orientation: portrait) {
        .page { margin: 0; box-shadow: none; width: 148.5mm; height: 210mm; flex-direction: column; }
        .slip { width: 100%; height: 50%; border-right: none; border-bottom: 1.5px dashed #94a3b8; }
        .slip:last-child { border-right: none; border-bottom: none; }
      }
    }
  </style>`;

    popup.document.body.innerHTML = twoCopies;

    // Wait for all images to load before triggering print
    popup.document.addEventListener("DOMContentLoaded", () => {
        const imgs = Array.from(popup.document.images);
        if (imgs.length === 0) { popup.focus(); popup.print(); return; }
        let loaded = 0;
        const tryPrint = () => { if (++loaded >= imgs.length) { popup.focus(); popup.print(); } };
        imgs.forEach(img => {
            if (img.complete) tryPrint();
            else { img.onload = tryPrint; img.onerror = tryPrint; }
        });
    });

    // Fallback — fire print after a safe delay regardless
    setTimeout(() => {
        try { popup.focus(); popup.print(); } catch (_) { /* already printed */ }
    }, 1200);
}

export interface ReceiptData {
    title?: string;
    receiptNo: string;
    studentName: string;
    admissionNo?: string;
    classSection: string;
    rollNo?: string;
    extraInfo?: { label: string; value: string }[];
    paidOn?: string;
    feeMonth: string;
    lineItems: { label: string; amount: number }[];
    totalAmount: number;
    paymentMode?: "CASH" | "UPI" | "CHEQUE" | string;
    arrearsMonths?: string[];
}

export function buildReceiptHTML(data: ReceiptData): string {
    const {
        title = "Fee Receipt",
        receiptNo,
        studentName,
        classSection,
        rollNo,
        admissionNo,
        extraInfo = [],
        paidOn = "N/A",
        feeMonth,
        lineItems,
        totalAmount,
        paymentMode,
        arrearsMonths,
    } = data;

    const admNo = admissionNo || rollNo || "";
    const fmt = (n: number) =>
        n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rows = lineItems.map((item, i) => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:3px 4px;color:#94a3b8;font-size:7px;text-align:center;">${i + 1}</td>
        <td style="padding:3px 4px;font-size:7.5px;color:#1e293b;">${item.label}</td>
        <td style="padding:3px 4px;text-align:right;font-size:8px;color:#1e293b;font-weight:600;">₹${fmt(item.amount)}</td>
      </tr>`).join("");

    const extraInfoRows = extraInfo.map(e =>
        `<div style="display:flex;gap:4px;"><span style="font-size:6.5px;color:#94a3b8;min-width:45px;">${e.label}</span><span style="font-size:7px;font-weight:700;color:#1e293b;">${e.value}</span></div>`
    ).join("");

    const isTransport = title.toLowerCase().includes("transport");
    const accentColor = isTransport ? "#4f46e5" : "#0f2044";
    const accentLight = isTransport ? "#eef2ff" : "#eff6ff";
    const accentBorder = isTransport ? "#c7d2fe" : "#bfdbfe";
    const accentText = isTransport ? "#4338ca" : "#1d4ed8";

    return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;height:100%;display:flex;flex-direction:column;gap:0;">

  <!-- School Header -->
  <div style="display:flex;align-items:center;gap:6px;padding-bottom:5px;border-bottom:2px solid ${accentColor};margin-bottom:6px;">
    <img src="__SCHOOL_LOGO__" style="width:36px;height:36px;object-fit:contain;flex-shrink:0;" alt="IAS Logo" />
    <div style="flex:1;">
      <div style="font-size:10.5px;font-weight:900;color:${accentColor};text-transform:uppercase;letter-spacing:.02em;line-height:1.1;">
        International Access School
      </div>
      <div style="font-size:6px;color:#64748b;margin-top:2px;">
        Affiliated to CBSE · Aff. No: 330691 | Code: 65688
      </div>
      <div style="font-size:6px;color:#64748b;">
        Siwan, Bihar – 841227 | Ph: +91 84060 00830
      </div>
    </div>
  </div>
  
  <div style="text-align:center;margin-bottom:6px;margin-top:-2px;">
      <div style="display:inline-block;padding:2px 8px;background:${accentLight};color:${accentText};font-size:6.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;border:1px solid ${accentBorder};border-radius:999px;">
        ${title}
      </div>
  </div>

  <!-- Receipt No + Date row -->
  <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:4px 6px;margin-bottom:6px;">
    <div>
      <div style="color:#94a3b8;font-size:6px;text-transform:uppercase;font-weight:700;">Receipt No.</div>
      <div style="font-family:monospace;font-size:8px;font-weight:900;color:${accentColor};">${receiptNo}</div>
    </div>
    <div style="width:1px;height:16px;background:#e2e8f0;"></div>
    <div>
      <div style="color:#94a3b8;font-size:6px;text-transform:uppercase;font-weight:700;">Month</div>
      <div style="font-size:7.5px;font-weight:700;color:#334155;">${feeMonth}</div>
    </div>
    <div style="width:1px;height:16px;background:#e2e8f0;"></div>
    <div style="text-align:right;">
      <div style="color:#94a3b8;font-size:6px;text-transform:uppercase;font-weight:700;">Date</div>
      <div style="font-size:7.5px;font-weight:700;color:#334155;">${paidOn}</div>
    </div>
  </div>

  <!-- Student Info -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:5px 6px;margin-bottom:6px;">
    <div style="grid-column:1 / span 2;">
      <div style="color:#94a3b8;font-size:6px;text-transform:uppercase;font-weight:700;">Student Name</div>
      <div style="font-size:9.5px;font-weight:800;color:#0f172a;margin-top:1px;">${studentName}</div>
    </div>
    <div>
      <div style="color:#94a3b8;font-size:6px;text-transform:uppercase;font-weight:700;">Adm No.</div>
      <div style="font-size:8.5px;font-weight:800;color:${accentColor};margin-top:1px;font-family:monospace;">${admNo || "—"}</div>
    </div>
    <div>
      <div style="color:#94a3b8;font-size:6px;text-transform:uppercase;font-weight:700;">Class / Sec</div>
      <div style="font-size:8px;font-weight:600;color:#334155;margin-top:1px;">${classSection}</div>
    </div>
    <div style="grid-column:1 / span 2;">
      <div style="color:#94a3b8;font-size:6px;text-transform:uppercase;font-weight:700;margin-bottom:2px;">Payment Mode</div>
      <div style="display:inline-block;padding:1.5px 6px;background:#dcfce7;color:#15803d;font-size:6.5px;font-weight:800;text-transform:uppercase;border-radius:999px;border:1px solid #bbf7d0;">
        PAID · ${paymentMode || "CASH"}
      </div>
    </div>
    ${extraInfoRows ? `<div style="grid-column:1 / span 2;">${extraInfoRows}</div>` : ""}
  </div>

  ${arrearsMonths?.length ? `
  <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:4px;padding:3px 6px;margin-bottom:6px;font-size:6.5px;">
    <span style="font-weight:800;color:#be123c;text-transform:uppercase;">Arrears: </span>
    <span style="color:#9f1239;">${arrearsMonths.join(", ")}</span>
  </div>` : ""}

  <!-- Fee Table -->
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;flex:1;">
    <thead>
      <tr style="background:${accentColor};">
        <th style="padding:4px;font-size:6px;text-align:center;color:#fff;font-weight:700;text-transform:uppercase;width:24px;">#</th>
        <th style="padding:4px;font-size:6px;text-align:left;color:#fff;font-weight:700;text-transform:uppercase;">Particulars</th>
        <th style="padding:4px;font-size:6px;text-align:right;color:#fff;font-weight:700;text-transform:uppercase;">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:#f1f5f9;border-top:1px solid ${accentColor};">
        <td colspan="2" style="padding:5px 6px;font-size:8.5px;font-weight:900;color:${accentColor};text-align:right;text-transform:uppercase;">
          Total Paid
        </td>
        <td style="padding:5px 6px;font-size:10.5px;font-weight:900;color:${accentColor};text-align:right;">
          ₹${fmt(totalAmount)}
        </td>
      </tr>
    </tfoot>
  </table>

  <!-- Footer -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:6px;margin-top:6px;border-top:1px dashed #cbd5e1;">
    <div style="font-size:5.5px;color:#94a3b8;line-height:1.4;">
      <div>Computer-generated receipt.</div>
      <div>No signature required if stamped.</div>
    </div>
    <div style="display:flex;gap:16px;align-items:flex-end;">
      <div style="text-align:center;">
        <div style="width:36px;height:36px;border:1px solid #e2e8f0;border-radius:50%;margin:0 auto 2px;"></div>
        <div style="font-size:6px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Stamp</div>
      </div>
      <div style="text-align:center;">
        <div style="width:64px;border-bottom:1px solid #475569;margin-bottom:2px;"></div>
        <div style="font-size:6px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Auth. Signatory</div>
      </div>
    </div>
  </div>

</div>`;
}
