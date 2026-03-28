/**
 * printReceiptHTML — Opens a new popup window with the receipt HTML and triggers print.
 * This reliably avoids the blank-page issue caused by printing from inside a fixed-position modal.
 */
export function printReceiptHTML(bodyHTML: string, title = "Fee Receipt"): void {
    const popup = window.open("", "_blank", "width=900,height=700,scrollbars=yes");
    if (!popup) {
        alert("Please allow popups for this website to print/download receipts.");
        return;
    }

    popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            color: #1a1a2e;
            background: #fff;
            padding: 32px;
        }
        @media print {
            body { padding: 16px; }
        }
    </style>
</head>
<body>
${bodyHTML}
</body>
</html>`);

    popup.document.close();
    // Small delay ensures styles are applied before print dialog opens
    popup.onload = () => {
        popup.focus();
        popup.print();
    };
    // Fallback in case onload doesn't fire (e.g. same-origin quirks)
    setTimeout(() => {
        try { popup.focus(); popup.print(); } catch (_) { /* already printed */ }
    }, 500);
}

/**
 * buildReceiptHTML — Generates the receipt HTML string from the receipt data.
 */
export interface ReceiptData {
    title?: string;          // "School Fee Receipt" | "Transport Fee Receipt"
    accentColor?: string;    // hex or css color for the badge, default navy
    receiptNo: string;
    studentName: string;
    classSection: string;    // e.g. "Class 5 - A"
    rollNo?: string;
    extraInfo?: { label: string; value: string }[];  // e.g. Bus Number
    paidOn?: string;         // formatted date string
    feeMonth: string;        // e.g. "March 2026"
    lineItems: { label: string; amount: number }[];
    totalAmount: number;
    paymentMode?: "CASH" | "UPI" | string;
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
        paymentMode
    } = data;

    const fmtAmount = (n: number) =>
        n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const lineRowsHTML = lineItems
        .map(
            (item, i) => `
      <tr>
        <td style="padding:10px 16px;color:#888;border-bottom:1px solid #f0f0f0;">${i + 1}.</td>
        <td style="padding:10px 16px;font-weight:500;color:#1a1a2e;border-bottom:1px solid #f0f0f0;">${item.label}</td>
        <td style="padding:10px 16px;text-align:right;color:#4a4a6a;border-bottom:1px solid #f0f0f0;">${fmtAmount(item.amount)}</td>
      </tr>`
        )
        .join("");

    const extraRows = [
        rollNo ? { label: "Admission No", value: rollNo } : null,
        ...extraInfo,
    ]
        .filter(Boolean)
        .map(
            (r: any) => `
      <div style="margin-bottom:12px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:2px;">${r.label}</p>
        <p style="font-weight:600;color:#1a1a2e;">${r.value}</p>
      </div>`
        )
        .join("");

    return `
<div style="max-width:680px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;">
  <!-- School Header -->
  <div style="text-align:center;border-bottom:2px solid #e5e7eb;padding-bottom:24px;margin-bottom:28px;">
    <h1 style="font-size:26px;font-weight:900;color:#0f2044;text-transform:uppercase;letter-spacing:.03em;">
      International Access School
    </h1>
    <p style="font-size:13px;color:#888;margin-top:6px;">Atarsua, Siwan, Bihar, India, 841227</p>
    <p style="font-size:11px;color:#aaa;margin-top:2px;">Phone: +91 84060 00830 | Email: info@iaschool.edu.in</p>
    <span style="display:inline-block;margin-top:14px;padding:5px 20px;background:#f0f4ff;color:#0f2044;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;border:1px solid #c7d8ff;border-radius:999px;">
      ${title}
    </span>
  </div>

  <!-- Details Grid -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px;font-size:13px;">
    <div>
      <div style="margin-bottom:12px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:2px;">Receipt Number</p>
        <p style="font-family:monospace;font-size:15px;font-weight:700;color:#0f2044;">${receiptNo}</p>
      </div>
      <div style="margin-bottom:12px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:2px;">Student Name</p>
        <p style="font-size:15px;font-weight:700;color:#1a1a2e;">${studentName}</p>
      </div>
      <div style="margin-bottom:12px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:2px;">Class / Section</p>
        <p style="font-weight:600;color:#1a1a2e;">${classSection}</p>
      </div>
      ${extraRows}
    </div>
    <div style="text-align:right;">
      <div style="margin-bottom:12px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:2px;">Date of Payment</p>
        <p style="font-weight:600;color:#1a1a2e;">${paidOn}</p>
      </div>
      <div style="margin-bottom:12px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:2px;">Fee Month</p>
        <p style="font-size:15px;font-weight:700;color:#0f2044;">${feeMonth}</p>
      </div>
      <div style="margin-bottom:12px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:2px;">Payment Status</p>
        <span style="display:inline-block;background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:3px 12px;border-radius:999px;border:1px solid #a7f3d0;">
          Paid Successfully
        </span>
        <div style="margin-top:4px;"><span style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">VIA ${paymentMode || "CASH"}</span></div>
      </div>
    </div>
  </div>

  <!-- Breakdown Table -->
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:13px;">
    <thead>
      <tr style="background:#f9fafb;">
        <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;width:48px;">S.No</th>
        <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Particulars</th>
        <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${lineRowsHTML}
    </tbody>
    <tfoot>
      <tr style="background:#f9fafb;border-top:2px solid #e5e7eb;">
        <th colspan="2" style="padding:16px;text-align:right;font-size:14px;font-weight:900;color:#0f2044;text-transform:uppercase;">Total Amount Paid</th>
        <td style="padding:16px;text-align:right;font-size:18px;font-weight:900;color:#0f2044;">₹${fmtAmount(totalAmount)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Signatures -->
  <div style="margin-top:60px;padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px dashed #d1d5db;">
    <div style="text-align:center;">
      <div style="width:120px;border-bottom:1px solid #9ca3af;margin-bottom:6px;"></div>
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;">Parent/Guardian Sign</p>
    </div>
    <div style="text-align:center;">
      <strong style="font-size:16px;font-weight:900;color:#0f2044;opacity:.25;display:block;margin-bottom:4px;">IAS Auth</strong>
      <div style="width:160px;border-bottom:1px solid #9ca3af;margin-bottom:6px;"></div>
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;">Authorized Signatory</p>
    </div>
  </div>
</div>`;
}
