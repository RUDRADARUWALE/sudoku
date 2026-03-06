const defaultRateCard = {
  "Acme Logistics": {
    "Freight Charge": { rate: 1200, gst: 18, hsn: "9965" },
    "Fuel Surcharge": { rate: 250, gst: 18, hsn: "9965", allowed: true },
  },
  "Prime Raw Materials": {
    "Steel Coil A": { rate: 56000, gst: 18, hsn: "7208" },
    "Handling Charge": { rate: 950, gst: 18, hsn: "9985", allowed: true },
  },
  "Bright Marketing": {
    "Campaign Management": { rate: 45000, gst: 18, hsn: "9983" },
    "Design Fee": { rate: 12000, gst: 18, hsn: "9983" },
  },
};

const statusEl = document.getElementById("status");
const filesInput = document.getElementById("invoice-files");
const auditBtn = document.getElementById("audit-btn");
const findingsBody = document.getElementById("findings-body");
const cards = document.getElementById("summary-cards");
const reportOutput = document.getElementById("report-output");
const rateCardArea = document.getElementById("rate-card");
const downloadBtn = document.getElementById("download-report");

rateCardArea.value = JSON.stringify(defaultRateCard, null, 2);

let lastReport = null;

const fmtMoney = (num) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(num || 0);

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function cleanNumber(raw) {
  if (typeof raw === "number") return raw;
  if (!raw) return 0;
  return Number(String(raw).replace(/[^\d.-]/g, "")) || 0;
}

function parseTextInvoice(text, filename) {
  const vendor = (text.match(/vendor\s*[:\-]\s*(.+)/i) || [])[1]?.trim() || "Unknown Vendor";
  const invoiceNumber = (text.match(/invoice\s*(?:no|number)?\s*[:\-]\s*([A-Z0-9-]+)/i) || [])[1]?.trim() || filename;
  const date = (text.match(/date\s*[:\-]\s*([\d\/-]+)/i) || [])[1]?.trim() || "";

  const itemPattern = /item\s*[:\-]\s*([^\n]+?)\s*\|\s*qty\s*[:\-]\s*([\d.]+)\s*\|\s*rate\s*[:\-]\s*([\d.,]+)\s*\|\s*gst\s*[:\-]\s*([\d.]+)\s*\|\s*hsn\s*[:\-]\s*([A-Z0-9]+)/gi;
  const items = [];
  let match;
  while ((match = itemPattern.exec(text)) !== null) {
    const [, description, qty, rate, gst, hsn] = match;
    items.push({
      description: description.trim(),
      qty: cleanNumber(qty),
      rate: cleanNumber(rate),
      gst: cleanNumber(gst),
      hsn: String(hsn).trim(),
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const gstTotal = items.reduce((sum, item) => sum + (item.qty * item.rate * item.gst) / 100, 0);
  const claimedTotal = cleanNumber((text.match(/total\s*[:\-]\s*([\d.,]+)/i) || [])[1]);

  return {
    filename,
    invoiceNumber,
    vendor,
    date,
    items,
    billedTotal: claimedTotal || subtotal + gstTotal,
    extractionConfidence: items.length ? 0.96 : 0.82,
    rawText: text.slice(0, 4000),
  };
}

async function extractTextFromPdf(file) {
  const pdfjsLib = window["pdfjs-dist/build/pdf"];
  if (!pdfjsLib) throw new Error("PDF engine unavailable in this environment.");

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  let allText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    allText += pageText + "\n";
  }

  return allText;
}

async function extractTextFromImage(file) {
  if (!window.Tesseract) throw new Error("OCR engine unavailable in this environment.");
  const result = await window.Tesseract.recognize(file, "eng");
  return result.data.text;
}

async function extractInvoice(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "json") {
    const text = await file.text();
    const data = JSON.parse(text);
    return {
      filename: file.name,
      invoiceNumber: data.invoiceNumber || file.name,
      vendor: data.vendor || "Unknown Vendor",
      date: data.date || "",
      items: (data.items || []).map((item) => ({
        description: item.description || "Unknown Item",
        qty: cleanNumber(item.qty),
        rate: cleanNumber(item.rate),
        gst: cleanNumber(item.gst),
        hsn: String(item.hsn || ""),
      })),
      billedTotal: cleanNumber(data.total),
      extractionConfidence: 0.99,
      rawText: text,
    };
  }

  if (ext === "txt") {
    const text = await file.text();
    return parseTextInvoice(text, file.name);
  }

  if (ext === "pdf") {
    const text = await extractTextFromPdf(file);
    return parseTextInvoice(text, file.name);
  }

  if (["png", "jpg", "jpeg"].includes(ext)) {
    const text = await extractTextFromImage(file);
    return parseTextInvoice(text, file.name);
  }

  throw new Error(`Unsupported format: ${file.name}`);
}

function auditInvoice(invoice, rateCard, priorInvoices) {
  const flags = [];
  const vendorRates = rateCard[invoice.vendor] || {};

  let correctSubtotal = 0;
  let correctGst = 0;

  for (const item of invoice.items) {
    const expected = vendorRates[item.description];

    if (!expected) {
      if (/surcharge/i.test(item.description)) flags.push(`Mystery surcharge: ${item.description}`);
      correctSubtotal += item.qty * item.rate;
      correctGst += (item.qty * item.rate * item.gst) / 100;
      continue;
    }

    const expectedRate = cleanNumber(expected.rate);
    const expectedGstRate = cleanNumber(expected.gst);

    if (Math.abs(item.rate - expectedRate) > 0.01) {
      flags.push(`Rate mismatch on ${item.description}: billed ${item.rate}, contract ${expectedRate}`);
    }

    if (String(item.hsn) !== String(expected.hsn)) {
      flags.push(`HSN mismatch on ${item.description}: billed ${item.hsn}, expected ${expected.hsn}`);
    }

    if (Math.abs(item.gst - expectedGstRate) > 0.01) {
      flags.push(`GST mismatch on ${item.description}: billed ${item.gst}%, expected ${expectedGstRate}%`);
    }

    const lineBase = item.qty * expectedRate;
    correctSubtotal += lineBase;
    correctGst += (lineBase * expectedGstRate) / 100;

    const historicalRates = priorInvoices
      .filter((prev) => prev.vendor === invoice.vendor)
      .flatMap((prev) => prev.items)
      .filter((prevItem) => prevItem.description === item.description)
      .map((prevItem) => prevItem.rate)
      .filter((rate) => rate > 0);

    if (historicalRates.length) {
      const avg = historicalRates.reduce((sum, rate) => sum + rate, 0) / historicalRates.length;
      const variance = ((item.rate - avg) / avg) * 100;
      if (Math.abs(variance) > 10) {
        flags.push(`Historical variance on ${item.description}: ${variance.toFixed(1)}% vs average ${avg.toFixed(2)}`);
      }
    }
  }

  const calculatedBilled = invoice.items.reduce((sum, item) => {
    const base = item.qty * item.rate;
    return sum + base + (base * item.gst) / 100;
  }, 0);

  if (Math.abs(calculatedBilled - invoice.billedTotal) > 1) {
    flags.push(`Calculation error: line totals ${calculatedBilled.toFixed(2)} vs invoice total ${invoice.billedTotal.toFixed(2)}`);
  }

  const correctTotal = correctSubtotal + correctGst;
  const overcharge = Math.max(0, invoice.billedTotal - correctTotal);

  return {
    ...invoice,
    correctTotal,
    overcharge,
    flags,
  };
}

function renderDashboard(results) {
  const totals = results.reduce(
    (acc, inv) => {
      acc.billed += inv.billedTotal;
      acc.correct += inv.correctTotal;
      acc.overcharge += inv.overcharge;
      acc.flags += inv.flags.length;
      if (inv.flags.some((f) => f.startsWith("GST"))) acc.gst += 1;
      if (inv.flags.some((f) => f.startsWith("HSN"))) acc.hsn += 1;
      if (inv.flags.some((f) => f.startsWith("Mystery surcharge"))) acc.surcharge += 1;
      if (inv.flags.some((f) => f.startsWith("Calculation error"))) acc.calc += 1;
      return acc;
    },
    { billed: 0, correct: 0, overcharge: 0, flags: 0, gst: 0, hsn: 0, surcharge: 0, calc: 0 }
  );

  const cardsData = [
    ["Total Billed", fmtMoney(totals.billed)],
    ["Correct Amount", fmtMoney(totals.correct)],
    ["Estimated Overcharge", fmtMoney(totals.overcharge)],
    ["Total Flags", totals.flags],
    ["GST Flags", totals.gst],
    ["HSN Flags", totals.hsn],
    ["Mystery Surcharges", totals.surcharge],
    ["Calc Errors", totals.calc],
  ];

  cards.innerHTML = cardsData
    .map(([label, value]) => `<article class="card"><h3>${label}</h3><p>${value}</p></article>`)
    .join("");
}

function renderFindings(results) {
  findingsBody.innerHTML = results
    .map(
      (invoice) => `<tr>
      <td>${invoice.invoiceNumber}</td>
      <td>${invoice.vendor}</td>
      <td>${fmtMoney(invoice.billedTotal)}</td>
      <td>${fmtMoney(invoice.correctTotal)}</td>
      <td class="${invoice.overcharge > 0 ? "hot" : "ok"}">${fmtMoney(invoice.overcharge)}</td>
      <td>
        <ul>${invoice.flags.map((flag) => `<li>${flag}</li>`).join("") || "<li>No issues</li>"}</ul>
      </td>
    </tr>`
    )
    .join("");
}

function detectDuplicates(results) {
  const seen = new Map();
  for (const invoice of results) {
    const key = `${invoice.vendor}|${invoice.invoiceNumber}|${invoice.billedTotal.toFixed(2)}`;
    if (seen.has(key)) {
      invoice.flags.push(`Duplicate invoice detected (matches ${seen.get(key)})`);
    } else {
      seen.set(key, invoice.filename);
    }
  }
}

function buildReport(results) {
  const overchargesByVendor = results.reduce((acc, invoice) => {
    acc[invoice.vendor] = (acc[invoice.vendor] || 0) + invoice.overcharge;
    return acc;
  }, {});

  return {
    processedAt: new Date().toISOString(),
    invoiceCount: results.length,
    extractionAccuracyEstimate: (
      (results.reduce((sum, inv) => sum + inv.extractionConfidence, 0) / (results.length || 1)) * 100
    ).toFixed(2) + "%",
    overchargesByVendor,
    findings: results.map((inv) => ({
      filename: inv.filename,
      invoiceNumber: inv.invoiceNumber,
      vendor: inv.vendor,
      billedTotal: inv.billedTotal,
      correctTotal: inv.correctTotal,
      overcharge: inv.overcharge,
      flags: inv.flags,
    })),
    recommendedActions: [
      "Raise debit notes for overcharged invoices with rate mismatch evidence.",
      "Block duplicate invoice numbers in ERP workflow.",
      "Require GST/HSN master validation before posting AP entries.",
      "Add contract-linked PO controls for surcharge line items.",
    ],
  };
}

async function runAudit() {
  const files = Array.from(filesInput.files || []);
  if (!files.length) {
    setStatus("Please upload at least one invoice file.", true);
    return;
  }

  let rateCard;
  try {
    rateCard = JSON.parse(rateCardArea.value);
  } catch {
    setStatus("Rate card JSON is invalid. Fix JSON syntax and retry.", true);
    return;
  }

  findingsBody.innerHTML = "";
  cards.innerHTML = "";
  reportOutput.textContent = "";

  const extracted = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setStatus(`Processing ${i + 1}/${files.length}: ${file.name}`);
    try {
      const parsed = await extractInvoice(file);
      extracted.push(parsed);
    } catch (error) {
      extracted.push({
        filename: file.name,
        invoiceNumber: file.name,
        vendor: "Extraction Failed",
        items: [],
        billedTotal: 0,
        extractionConfidence: 0,
        rawText: "",
        error: error.message,
      });
    }
  }

  const audited = [];
  for (const invoice of extracted) {
    if (invoice.error) {
      audited.push({ ...invoice, correctTotal: 0, overcharge: 0, flags: [invoice.error] });
      continue;
    }
    audited.push(auditInvoice(invoice, rateCard, audited));
  }

  detectDuplicates(audited);

  renderDashboard(audited);
  renderFindings(audited);

  lastReport = buildReport(audited);
  reportOutput.textContent = JSON.stringify(lastReport, null, 2);

  setStatus(`Completed audit for ${files.length} file(s).`);
}

function downloadReport() {
  if (!lastReport) {
    setStatus("Run an audit before downloading report.", true);
    return;
  }
  const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `invoice-audit-report-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

auditBtn.addEventListener("click", runAudit);
downloadBtn.addEventListener("click", downloadReport);
