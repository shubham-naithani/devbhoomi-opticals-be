const PDFDocument = require("pdfkit");
const bwipjs = require("bwip-js");

const BRAND_DARK = "#1A1D1F";
const BRAND_RED = "#E2231A";
const TEXT_MUTED = "#6b7280";
const BORDER_LIGHT = "#e5e7eb";

async function renderBarcodePng(text) {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: "center",
  });
}

async function generateInvoicePdf(order) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const pageWidth = doc.page.width - 100; // usable width after margins

  // ---- Header band ----
  doc.rect(0, 0, doc.page.width, 110).fill(BRAND_DARK);
  doc.fillColor("#fff").fontSize(24).font("Helvetica-Bold").text("Devbhoomi Optical", 50, 35);
  doc.fontSize(10).font("Helvetica").fillColor("#c9c9c9").text("Dehradun, Uttarakhand", 50, 65);

  doc.fillColor("#fff").fontSize(11).font("Helvetica-Bold")
    .text(`INVOICE #${order.orderId}`, 50, 35, { width: pageWidth, align: "right" });
  doc.fontSize(9).font("Helvetica").fillColor("#c9c9c9")
    .text(new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }), 50, 55, { width: pageWidth, align: "right" });

  doc.y = 140;

  // ---- Billed to ----
  const customerName = typeof order.customer === "object" ? order.customer.name : "Customer";
  const customerPhone = typeof order.customer === "object" ? order.customer.phone : "";

  doc.fillColor(TEXT_MUTED).fontSize(9).font("Helvetica").text("BILLED TO", 50, doc.y);
  doc.fillColor("#111").fontSize(13).font("Helvetica-Bold").text(customerName, 50, doc.y + 4);
  if (customerPhone) doc.fillColor(TEXT_MUTED).fontSize(10).font("Helvetica").text(customerPhone, 50, doc.y + 2);

  doc.moveDown(2);

  // ---- Items table header ----
  const tableTop = doc.y;
  doc.rect(50, tableTop, pageWidth, 24).fill("#f3f4f6");
  doc.fillColor(TEXT_MUTED).fontSize(9).font("Helvetica-Bold");
  doc.text("ITEM", 58, tableTop + 8);
  doc.text("QTY", 320, tableTop + 8, { width: 40, align: "center" });
  doc.text("PRICE", 370, tableTop + 8, { width: 70, align: "right" });
  doc.text("TOTAL", 445, tableTop + 8, { width: 100, align: "right" });

  doc.y = tableTop + 24 + 10;

  // ---- Line items ----
  for (const item of order.items) {
    const rowStart = doc.y;

    doc.fillColor("#111").fontSize(10.5).font("Helvetica-Bold").text(item.name, 58, rowStart, { width: 250 });
    let nameBottom = doc.y;

    if (item.itemDiscountPercent > 0) {
      doc.fillColor(BRAND_RED).fontSize(8.5).font("Helvetica")
        .text(`${item.itemDiscountPercent}% discount applied`, 58, nameBottom + 2, { width: 250 });
      nameBottom = doc.y;
    }

    const lineTotal = item.price * item.quantity - (item.itemDiscountAmount || 0);

    doc.fillColor("#333").fontSize(10).font("Helvetica")
      .text(String(item.quantity), 320, rowStart, { width: 40, align: "center" });
    doc.text(`Rs.${item.price.toFixed(2)}`, 370, rowStart, { width: 70, align: "right" });
    doc.font("Helvetica-Bold").fillColor("#111")
      .text(`Rs.${lineTotal.toFixed(2)}`, 445, rowStart, { width: 100, align: "right" });

    let bottomY = Math.max(nameBottom, rowStart + 14);

    // Barcode, right-aligned under the row
    if (item.articleId && item.barcode) {
      try {
        const png = await renderBarcodePng(item.barcode);
        doc.image(png, 58, bottomY + 6, { width: 160 });
        bottomY += 6 + 45; // reserve space for barcode image height
      } catch (err) {
        console.error("[Invoice] Barcode render failed for item:", item.name, err.message);
      }
    }

    doc.y = bottomY + 14;
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor(BORDER_LIGHT).lineWidth(0.5).stroke();
    doc.y += 14;
  }

  doc.moveDown(0.5);

  // ---- Totals block ----
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemDiscountTotal = order.items.reduce((sum, i) => sum + (i.itemDiscountAmount || 0), 0);

  const totalsX = 330;
  const totalsWidth = pageWidth - (totalsX - 50);

  function totalRow(label, value, opts = {}) {
    doc.fontSize(opts.size || 10).font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(opts.color || "#333");
    doc.text(label, totalsX, doc.y, { width: totalsWidth - 100, continued: false });
    doc.text(value, totalsX + totalsWidth - 100, doc.y - doc.currentLineHeight(), { width: 100, align: "right" });
    doc.moveDown(0.4);
  }

  totalRow("Subtotal (MRP)", `Rs.${subtotal.toFixed(2)}`);
  if (itemDiscountTotal > 0) totalRow("Item discounts", `-Rs.${itemDiscountTotal.toFixed(2)}`, { color: BRAND_RED });
  if (order.discountAmount > 0) totalRow(`Coupon (${order.couponCode})`, `-Rs.${order.discountAmount.toFixed(2)}`, { color: BRAND_RED });
  if (order.shippingCharge > 0) totalRow("Shipping", `+Rs.${order.shippingCharge.toFixed(2)}`);

  doc.moveDown(0.3);
  doc.moveTo(totalsX, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor(BORDER_LIGHT).stroke();
  doc.moveDown(0.5);

  totalRow("Total", `Rs.${order.totalAmount.toFixed(2)}`, { size: 14, bold: true, color: BRAND_DARK });
  totalRow("Paid", `Rs.${order.amountPaid.toFixed(2)}`);

  const balanceDue = Math.max(order.totalAmount - order.amountPaid, 0);
  if (balanceDue > 0) totalRow("Balance due", `Rs.${balanceDue.toFixed(2)}`, { bold: true, color: BRAND_RED });

  // ---- Footer ----
  doc.fontSize(8.5).font("Helvetica").fillColor(TEXT_MUTED)
    .text("Thank you for shopping with Devbhoomi Optical.", 50, doc.page.height - 60, { width: pageWidth, align: "center" });

  doc.end();
  return done;
}

module.exports = { generateInvoicePdf };