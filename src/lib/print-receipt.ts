/**
 * printReceiptHTML — Opens a popup with 2 receipt copies on a single A4 sheet.
 * Top half = Student Copy, Bottom half = Office Copy.
 */
export function printReceiptHTML(bodyHTML: string, title = "Fee Receipt"): void {
    const popup = window.open("", "_blank", "width=900,height=700,scrollbars=yes");
    if (!popup) {
        alert("Please allow popups for this website to print/download receipts.");
        return;
    }

    const logoUrl = window.location.origin + "/LOGO.png";
    const resolvedHTML = bodyHTML.replace(/__SCHOOL_LOGO__/g, logoUrl);

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

    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 12px auto;
      background: #fff;
      display: flex;
      flex-direction: column;
    }

    .slip {
      width: 100%;
      height: 148.5mm;
      padding: 8mm 10mm 6mm;
      overflow: hidden;
      border-bottom: 2px dashed #94a3b8;
      position: relative;
    }
    .slip:last-child { border-bottom: none; }

    /* Watermark */
    .slip::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 55%;
      height: 55%;
      background-image: url('${logoUrl}');
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
      bottom: 3mm;
      right: 5mm;
      font-size: 7px;
      font-weight: 800;
      letter-spacing: .1em;
      color: #94a3b8;
      text-transform: uppercase;
      z-index: 2;
    }

    @media print {
      body { background: #fff; }
      .page { margin: 0; width: 210mm; min-height: 297mm; }
      .slip { border-bottom: 1.5px dashed #94a3b8; }
      @page { size: A4 portrait; margin: 0; }
    }
  </style>`;
    popup.document.body.innerHTML = twoCopies;
    popup.onload = () => { popup.focus(); popup.print(); };
    setTimeout(() => {
        try { popup.focus(); popup.print(); } catch (_) { /* already printed */ }
    }, 600);
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
        <td style="padding:4px 6px;color:#94a3b8;font-size:9px;text-align:center;">${i + 1}</td>
        <td style="padding:4px 6px;font-size:9.5px;color:#1e293b;">${item.label}</td>
        <td style="padding:4px 6px;text-align:right;font-size:9.5px;color:#1e293b;font-weight:600;">₹${fmt(item.amount)}</td>
      </tr>`).join("");

    const extraInfoRows = extraInfo.map(e =>
        `<div style="display:flex;gap:6px;"><span style="font-size:8px;color:#94a3b8;min-width:60px;">${e.label}</span><span style="font-size:8px;font-weight:700;color:#1e293b;">${e.value}</span></div>`
    ).join("");

    const isTransport = title.toLowerCase().includes("transport");
    const accentColor = isTransport ? "#4f46e5" : "#0f2044";
    const accentLight = isTransport ? "#eef2ff" : "#eff6ff";
    const accentBorder = isTransport ? "#c7d2fe" : "#bfdbfe";
    const accentText = isTransport ? "#4338ca" : "#1d4ed8";

    return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;height:100%;display:flex;flex-direction:column;gap:0;">

  <!-- School Header -->
  <div style="display:flex;align-items:center;gap:8px;padding-bottom:6px;border-bottom:2px solid ${accentColor};margin-bottom:6px;">
    <img src="__SCHOOL_LOGO__" style="width:42px;height:42px;object-fit:contain;flex-shrink:0;" alt="IAS Logo" />
    <div style="flex:1;">
      <div style="font-size:13px;font-weight:900;color:${accentColor};text-transform:uppercase;letter-spacing:.04em;line-height:1.2;">
        International Access School
      </div>
      <div style="font-size:7.5px;color:#64748b;margin-top:1px;">
        Affiliated to CBSE · Aff. No: 330691 &nbsp;|&nbsp; School Code: 65688
      </div>
      <div style="font-size:7.5px;color:#64748b;">
        Siwan, Bihar – 841227 &nbsp;|&nbsp; Ph: +91 84060 00830 &nbsp;|&nbsp; info@iaschool.edu.in
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0;">
      <div style="display:inline-block;padding:2px 10px;background:${accentLight};color:${accentText};font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;border:1px solid ${accentBorder};border-radius:999px;">
        ${title}
      </div>
      <div style="margin-top:4px;font-size:7.5px;color:#94a3b8;">ISO 9001·2005 Certified</div>
    </div>
  </div>

  <!-- Receipt No + Date row -->
  <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;margin-bottom:6px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div>
        <div style="color:#94a3b8;font-size:7px;text-transform:uppercase;font-weight:700;letter-spacing:.06em;">Receipt No.</div>
        <div style="font-family:monospace;font-size:11px;font-weight:900;color:${accentColor};">${receiptNo}</div>
      </div>
      <div style="width:1px;height:28px;background:#e2e8f0;"></div>
      <div>
        <div style="color:#94a3b8;font-size:7px;text-transform:uppercase;font-weight:700;letter-spacing:.06em;">Fee Month</div>
        <div style="font-size:9px;font-weight:700;color:#334155;">${feeMonth}</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="color:#94a3b8;font-size:7px;text-transform:uppercase;font-weight:700;letter-spacing:.06em;">Date of Payment</div>
      <div style="font-size:9px;font-weight:700;color:#334155;">${paidOn}</div>
    </div>
  </div>

  <!-- Student Info -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin-bottom:6px;">
    <div>
      <div style="color:#94a3b8;font-size:7px;text-transform:uppercase;font-weight:700;letter-spacing:.06em;">Student Name</div>
      <div style="font-size:11px;font-weight:800;color:#0f172a;margin-top:1px;">${studentName}</div>
    </div>
    <div>
      <div style="color:#94a3b8;font-size:7px;text-transform:uppercase;font-weight:700;letter-spacing:.06em;">Admission No.</div>
      <div style="font-size:11px;font-weight:800;color:${accentColor};margin-top:1px;font-family:monospace;">${admNo || "—"}</div>
    </div>
    <div style="margin-top:3px;">
      <div style="color:#94a3b8;font-size:7px;text-transform:uppercase;font-weight:700;letter-spacing:.06em;">Class / Section</div>
      <div style="font-size:9px;font-weight:600;color:#334155;margin-top:1px;">${classSection}</div>
    </div>
    <div style="margin-top:3px;">
      <div style="color:#94a3b8;font-size:7px;text-transform:uppercase;font-weight:700;letter-spacing:.06em;">Payment Mode</div>
      <div style="margin-top:1px;display:inline-block;padding:1px 8px;background:#dcfce7;color:#15803d;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;border-radius:999px;border:1px solid #bbf7d0;">
        PAID · ${paymentMode || "CASH"}
      </div>
    </div>
    ${extraInfoRows}
  </div>

  ${arrearsMonths?.length ? `
  <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:4px;padding:3px 8px;margin-bottom:4px;font-size:7.5px;">
    <span style="font-weight:800;color:#be123c;text-transform:uppercase;letter-spacing:.05em;">Arrears included: </span>
    <span style="color:#9f1239;">${arrearsMonths.join(", ")}</span>
  </div>` : ""}

  <!-- Fee Table -->
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;flex:1;">
    <thead>
      <tr style="background:${accentColor};">
        <th style="padding:5px 6px;font-size:7.5px;text-align:center;color:rgba(255,255,255,0.8);font-weight:700;text-transform:uppercase;letter-spacing:.06em;width:32px;">#</th>
        <th style="padding:5px 6px;font-size:7.5px;text-align:left;color:rgba(255,255,255,0.8);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Particulars</th>
        <th style="padding:5px 6px;font-size:7.5px;text-align:right;color:rgba(255,255,255,0.8);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:#f1f5f9;border-top:2px solid ${accentColor};">
        <td colspan="2" style="padding:6px 8px;font-size:10px;font-weight:900;color:${accentColor};text-align:right;text-transform:uppercase;letter-spacing:.04em;">
          Total Amount Paid
        </td>
        <td style="padding:6px 8px;font-size:13px;font-weight:900;color:${accentColor};text-align:right;">
          ₹${fmt(totalAmount)}
        </td>
      </tr>
    </tfoot>
  </table>

  <!-- Footer -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:5px;margin-top:4px;border-top:1px dashed #cbd5e1;">
    <div style="font-size:7px;color:#94a3b8;line-height:1.6;">
      <div>This is a computer-generated receipt.</div>
      <div>No signature required if stamped.</div>
    </div>
    <div style="display:flex;gap:16px;align-items:flex-end;">
      <div style="text-align:center;">
        <div style="width:48px;height:48px;border:1px solid #e2e8f0;border-radius:50%;margin:0 auto 2px;"></div>
        <div style="font-size:7px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Stamp</div>
      </div>
      <div style="text-align:center;">
        <div style="width:80px;border-bottom:1px solid #475569;margin-bottom:2px;"></div>
        <div style="font-size:7px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Authorized Signatory</div>
      </div>
    </div>
  </div>

</div>`;
}
