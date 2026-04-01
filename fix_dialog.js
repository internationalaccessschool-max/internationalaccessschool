const fs = require('fs');
const file = 'e:/International Access School/src/app/accountant/fees/page.tsx';
let c = fs.readFileSync(file, 'utf8');

// ── Fix 1: Add schoolAlreadyPaid + totalPayable computed by markPaidType ──
// target: the isCF line in the dialog IIFE
const f1old = 'const isCF = markPaidRecord.status === "carried_forward";\n                                                         const schoolTotal = isCF ? schoolFeeBase : (markPaidRecord.totalAmount || (schoolFeeBase + schoolPrevDues));\n                                                         const transportPrevDues = markPaidRecord.transportPreviousDues || 0;\n                                                         const transportTotal = markPaidRecord.transportTotalAmount || (transportFee + transportPrevDues);';
const f1new = 'const isCF = markPaidRecord.status === "carried_forward";\n                                                         const schoolAlreadyPaid = markPaidRecord.status === "paid";\n                                                         // If school already paid or CF, charge only base; else full total\n                                                         const schoolTotal = (schoolAlreadyPaid || isCF) ? schoolFeeBase : (markPaidRecord.totalAmount || (schoolFeeBase + schoolPrevDues));\n                                                         const transportPrevDues = markPaidRecord.transportPreviousDues || 0;\n                                                         const transportTotal = markPaidRecord.transportTotalAmount || (transportFee + transportPrevDues);\n                                                         // Total payable = only what\'s being charged per user selection\n                                                         const totalPayable = markPaidType === "school" ? (schoolAlreadyPaid ? 0 : schoolTotal)\n                                                             : markPaidType === "transport" ? transportTotal\n                                                             : (schoolAlreadyPaid ? 0 : schoolTotal) + transportTotal;';

if (c.includes(f1old)) { c = c.replace(f1old, f1new); console.log('Fix 1 OK'); }
else { console.log('Fix 1 NOT FOUND'); }

// ── Fix 2: School fee header shows "Already Paid ✓" when school already paid ──
const f2old = '{/* School fee header */}\n                                                                     <div className="flex justify-between text-sm font-semibold text-navy">\n                                                                         <span className="flex items-center gap-1.5"><School className="w-4 h-4" /> School Fee (Current Month)</span>\n                                                                         <span>₹{schoolFeeBase.toLocaleString()}</span>\n                                                                     </div>';
const f2new = '{/* School fee header — show "Already Paid" instead of amount if school is done */}\n                                                                     <div className="flex justify-between text-sm font-semibold text-navy">\n                                                                         <span className="flex items-center gap-1.5"><School className="w-4 h-4" /> School Fee (Current Month)</span>\n                                                                         {schoolAlreadyPaid ? (\n                                                                             <span className="flex items-center gap-1 text-emerald-600 font-medium text-xs">\n                                                                                 <CheckCircle2 className="w-3.5 h-3.5" /> Already Paid\n                                                                             </span>\n                                                                         ) : (\n                                                                             <span>₹{schoolFeeBase.toLocaleString()}</span>\n                                                                         )}\n                                                                     </div>';
if (c.includes(f2old)) { c = c.replace(f2old, f2new); console.log('Fix 2 OK'); }
else { console.log('Fix 2 NOT FOUND'); }

// ── Fix 3: Total Payable uses totalPayable instead of schoolTotal + transportTotal ──
const f3old = '<span>₹{(schoolTotal + transportTotal).toLocaleString()}</span>';
const f3new = '<span>₹{totalPayable.toLocaleString()}</span>';
if (c.includes(f3old)) { c = c.replace(f3old, f3new); console.log('Fix 3 OK'); }
else { console.log('Fix 3 NOT FOUND'); }

// ── Fix 4: "Both" disabled when school already paid ──
const f4old = 'disabled: isSchoolPaid(markPaidRecord) && isTransportPaid(markPaidRecord)';
// Replace only in the "both" option (it may appear multiple times - find safe context)
const f4ctx = '{ value: "both" as MarkPaidType,';
const f4target = 'disabled: isSchoolPaid(markPaidRecord) && isTransportPaid(markPaidRecord)';
const f4replace = 'disabled: isSchoolPaid(markPaidRecord) || isTransportPaid(markPaidRecord) // disable Both if school already paid OR both paid';
// Find the "both" block and replace within it
const bothIdx = c.indexOf(f4ctx);
if (bothIdx !== -1) {
    const afterBoth = c.slice(bothIdx);
    const replaced = afterBoth.replace(f4target, f4replace);
    if (replaced !== afterBoth) {
        c = c.slice(0, bothIdx) + replaced;
        console.log('Fix 4 OK');
    } else { console.log('Fix 4 NOT FOUND in both block'); }
} else { console.log('Fix 4 context not found'); }

fs.writeFileSync(file, c, 'utf8');
console.log('Done.');
