/**
 * printReceiptHTML — Opens a popup with 4 receipt copies on a single A4 sheet.
 * Cut along the dashed lines — saves 75% paper vs. full-page printing.
 */
export function printReceiptHTML(bodyHTML: string, title = "Fee Receipt"): void {
    const popup = window.open("", "_blank", "width=900,height=700,scrollbars=yes");
    if (!popup) {
        alert("Please allow popups for this website to print/download receipts.");
        return;
    }

    // Resolve __SCHOOL_LOGO__ placeholder to absolute URL (popup is about:blank, relative paths fail)
    const logoUrl = window.location.origin + "/LOGO.png";
    const resolvedHTML = bodyHTML.replace(/__SCHOOL_LOGO__/g, logoUrl);

    // 4 identical copies in 2×2 grid on one A4
    const fourCopies = `
<div class="page">
  <div class="slip">${resolvedHTML}</div>
  <div class="slip">${resolvedHTML}</div>
  <div class="slip">${resolvedHTML}</div>
  <div class="slip">${resolvedHTML}</div>
</div>`;

    popup.document.title = title;
    popup.document.head.innerHTML = `
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; }

    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 12px auto;
      background: #fff;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
    }

    .slip {
      width: 105mm;
      height: 148.5mm;
      padding: 5mm;
      overflow: hidden;
      border: 1px dashed #cbd5e1;
      position: relative;
    }

    /* Watermark logo — centered, faded */
    .slip::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 62%;
      height: 62%;
      background-image: url('${logoUrl}');
      background-repeat: no-repeat;
      background-position: center;
      background-size: contain;
      opacity: 0.06;
      pointer-events: none;
      z-index: 0;
    }

    /* Ensure receipt content sits above watermark */
    .slip > div { position: relative; z-index: 1; }

    /* "OFFICE COPY" label on 2nd and 4th slip */
    .slip:nth-child(2)::after,
    .slip:nth-child(4)::after {
      content: "OFFICE COPY";
      position: absolute;
      top: 3mm;
      right: 4mm;
      font-size: 6px;
      font-weight: 700;
      letter-spacing: .08em;
      color: #94a3b8;
      text-transform: uppercase;
      z-index: 2;
    }

    @media print {
      body { background: #fff; }
      .page { margin: 0; width: 210mm; min-height: 297mm; page-break-after: always; }
      .slip { border: 1px dashed #cbd5e1; }
      @page { size: A4 portrait; margin: 0; }
    }
  </style>`;
    popup.document.body.innerHTML = fourCopies;
    popup.onload = () => { popup.focus(); popup.print(); };
    setTimeout(() => {
        try { popup.focus(); popup.print(); } catch (_) { /* already printed */ }
    }, 600);
}

/**
 * buildReceiptHTML — Compact A6-sized receipt (fits 4 per A4).
 * Uses __SCHOOL_LOGO__ placeholder — resolved by printReceiptHTML at runtime.
 */
export interface ReceiptData {
    title?: string;
    accentColor?: string;
    receiptNo: string;
    studentName: string;
    classSection: string;
    rollNo?: string;
    extraInfo?: { label: string; value: string }[];
    paidOn?: string;
    feeMonth: string;
    lineItems: { label: string; amount: number }[];
    totalAmount: number;
    paymentMode?: "CASH" | "UPI" | "CHEQUE" | string;
}

export function buildReceiptHTML(data: ReceiptData): string {
    const {
        title = "Fee Receipt",
        receiptNo,
        studentName,
        classSection,
        rollNo,
        extraInfo = [],
        paidOn = "N/A",
        feeMonth,
        lineItems,
        totalAmount,
        paymentMode,
    } = data;

    const fmt = (n: number) =>
        n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rows = lineItems.map((item, i) => `
      <tr>
        <td style="padding:2px 4px;color:#94a3b8;font-size:8px;">${i + 1}.</td>
        <td style="padding:2px 4px;font-size:8px;color:#1e293b;">${item.label}</td>
        <td style="padding:2px 4px;text-align:right;font-size:8px;color:#1e293b;">₹${fmt(item.amount)}</td>
      </tr>`).join("");

    const extras = [
        rollNo ? `<span style="font-size:7px;color:#64748b;">Adm#: <b>${rollNo}</b></span>` : "",
        ...extraInfo.map(e => `<span style="font-size:7px;color:#64748b;">${e.label}: <b>${e.value}</b></span>`),
    ].filter(Boolean).join(" &nbsp;|&nbsp; ");

    return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;height:100%;display:flex;flex-direction:column;gap:4px;">

  <!-- Header: logo + school name -->
  <div style="display:flex;align-items:center;gap:6px;border-bottom:1.5px solid #e2e8f0;padding-bottom:5px;">
    <img src="__SCHOOL_LOGO__"
         style="width:28px;height:28px;object-fit:contain;flex-shrink:0;"
         alt="IAS Logo" />
    <div style="flex:1;text-align:center;">
      <div style="font-size:10px;font-weight:900;color:#0f2044;text-transform:uppercase;letter-spacing:.03em;line-height:1.2;">
        International Access School
      </div>
      <div style="font-size:6.5px;color:#94a3b8;margin-top:1px;">Atarsua, Siwan, Bihar — +91 84060 00830</div>
      <span style="display:inline-block;margin-top:2px;padding:1px 7px;background:#eff6ff;color:#1d4ed8;font-size:6.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;border:1px solid #bfdbfe;border-radius:999px;">
        ${title}
      </span>
    </div>
  </div>

  <!-- Receipt No + Date -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <div style="color:#94a3b8;font-size:6.5px;text-transform:uppercase;font-weight:700;">Receipt No</div>
      <div style="font-family:monospace;font-size:10px;font-weight:700;color:#0f2044;">${receiptNo}</div>
    </div>
    <div style="text-align:right;">
      <div style="color:#94a3b8;font-size:6.5px;text-transform:uppercase;font-weight:700;">Date</div>
      <div style="font-weight:600;font-size:8px;">${paidOn}</div>
    </div>
  </div>

  <!-- Student Info -->
  <div style="background:#f8fafc;border-radius:4px;padding:4px 6px;border:1px solid #e2e8f0;">
    <div style="font-size:10px;font-weight:700;color:#0f2044;">${studentName}</div>
    <div style="font-size:8px;color:#475569;margin-top:1px;">${classSection} &nbsp;|&nbsp; ${feeMonth}</div>
    ${extras ? `<div style="margin-top:2px;">${extras}</div>` : ""}
  </div>

  <!-- Line Items -->
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;flex:1;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="padding:3px 4px;font-size:6.5px;text-align:left;color:#94a3b8;font-weight:700;text-transform:uppercase;">#</th>
        <th style="padding:3px 4px;font-size:6.5px;text-align:left;color:#94a3b8;font-weight:700;text-transform:uppercase;">Particulars</th>
        <th style="padding:3px 4px;font-size:6.5px;text-align:right;color:#94a3b8;font-weight:700;text-transform:uppercase;">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:#f1f5f9;border-top:1.5px solid #e2e8f0;">
        <td colspan="2" style="padding:4px 6px;font-size:9px;font-weight:900;color:#0f2044;text-align:right;text-transform:uppercase;">Total</td>
        <td style="padding:4px 6px;font-size:11px;font-weight:900;color:#0f2044;text-align:right;">₹${fmt(totalAmount)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Payment mode + signature -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:3px;border-top:1px dashed #cbd5e1;margin-top:auto;">
    <div>
      <span style="display:inline-block;padding:1px 7px;background:#dcfce7;color:#15803d;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-radius:999px;border:1px solid #bbf7d0;">
        PAID · ${paymentMode || "CASH"}
      </span>
    </div>
    <div style="text-align:center;">
      <div style="width:60px;border-bottom:1px solid #94a3b8;margin-bottom:2px;"></div>
      <div style="font-size:7px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Authorized Signatory</div>
    </div>
  </div>

</div>`;
}
