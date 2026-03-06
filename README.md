# AI Invoice Auditor

A browser-based auditing tool that detects billing leakage in vendor invoices by extracting invoice data and validating it against contract/rate-card logic.

## What it does

- Reads invoice files in multiple formats: **PDF, images (PNG/JPG), TXT, and JSON**.
- Extracts vendor, invoice number, line items, rates, GST %, HSN, and totals.
- Runs automated checks for:
  - Rate-card mismatches
  - GST and HSN discrepancies
  - Duplicate invoices
  - Mystery surcharges
  - Calculation errors
  - Historical price variance
- Produces a dashboard summary and downloadable JSON audit report.

## Run locally

1. Open `index.html` directly in a browser, or serve statically:
   ```bash
   python3 -m http.server 8000
   ```
2. Open `http://localhost:8000`
3. Upload one or more invoice files and click **Run Audit**.

## Input guidance

For best extraction accuracy in this client-only version:

- Use text-rich PDFs or high-quality scanned images.
- For deterministic testing, upload `.txt` invoices in this pattern:

```text
Vendor: Acme Logistics
Invoice No: ACM-1029
Date: 2026-02-02
Item: Freight Charge | Qty: 10 | Rate: 1300 | GST: 18 | HSN: 9965
Item: Fuel Surcharge | Qty: 10 | Rate: 300 | GST: 18 | HSN: 9965
Total: 18880
```

- You can paste your own vendor contract/rate-card JSON in the rate-card panel.

## Notes

- OCR for images uses `tesseract.js` in-browser.
- PDF text extraction uses `pdfjs-dist` in-browser.
- This project is front-end only; no invoice data is uploaded to a server by default.
