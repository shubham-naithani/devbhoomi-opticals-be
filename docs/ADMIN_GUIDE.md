# Devbhoomi Opticals — Admin Guide

This guide covers everything an **admin** account can do, in addition to everything in the Staff Guide (which covers walk-in orders, order management, repairs, and basic inventory browsing — read that first if you haven't).

---

## Managing Inventory

### Adding a New Product

1. Go to **Inventory** → **"+ Add product"**.
2. Fill in name, brand, category, gender, frame type/shape.
3. **Brand field**: start typing and existing brands will suggest themselves. If it's a genuinely new brand, an "Add as new brand" option appears — click it to save the brand for future use, even before you've added any products under it.
4. When you pick a known brand, the category/frame type/gender fields may auto-fill based on what you've stocked under that brand before — you can still change them.
5. Fill in the **first variant** (color, size, etc.):
   - **Cost price** — what you pay the supplier. Required.
   - **MRP** — calculated automatically as Cost × 1.40 by default. Check **"Manually set MRP"** to override with your own value instead.
   - **MSP (minimum selling price)** — calculated automatically as Cost × 1.25 by default. This is a **discount floor**: no one can sell below this price, whether through a coupon or a manual price change at the counter. Check **"Manually set MSP"** to enter a custom value below the MRP — the gap between MRP and your custom MSP is how much discount that item can ever receive.
   - **Stock** and **low stock alert threshold** (optional — leave blank to use the store-wide default of 5).
6. Add photos (up to 6), save.

A **barcode is generated automatically** the moment you save — no need to enter one yourself.

### Adding More Variants (Colors/Sizes) to an Existing Product

Open the product → **"Manage variants"** → **"+ Add variant"**. Same fields as above.

### Editing an Existing Variant

**If you're only changing stock manually** (not through a supplier delivery — see Purchases below), you'll be asked for a **reason** the moment you change the stock number. This is required — it's what makes the Stock History page useful later ("why did this change?").

### Printing a Barcode Label

In "Manage variants," click **"Print label"** on any variant that has a barcode. This opens a print modal with a live preview — pick the label type, check the preview, then click **Print**. This button is **admin-only** — staff can view stock and barcodes but don't have printing access.

There are two label types:

- **Box label** — a 50×50mm square label, everything (store name, product, variant, barcode) stacked top to bottom on one sticker.
- **Frame/tag label** — the dumbbell-shaped tag meant to be tied onto a frame with string: brand/product/variant text on one end, a scissor-cut in the middle, and the barcode on the other end. These print 3-across on the roll (the printer's stock is 3 lanes wide).

Both label types print through the **DP27 Label Printer** — there's no more "or print on a regular printer" fallback; both go through the same dedicated label printer (see the Technical Setup Guide for what needs to be running on the printing computer for this to work — if Print does nothing or errors out, that's the first thing to check).

**Bulk printing:** from the Inventory list, select multiple variants and choose the bulk print option. Frame labels fill lanes left-to-right, 3 per row — if the last row doesn't divide evenly (e.g. you printed 2 items), the 3rd lane in that row is left blank rather than wasted on a partial/incorrect label.

**Single print + reusing a leftover lane:** if a previous bulk print left a lane blank (as above), or you just need to reprint one item, use the single-print option and set the **lane number (1, 2, or 3)** field to target that exact physical lane instead of starting a fresh row and wasting the other two.

### Low Stock Alerts

Every morning, the system checks for anything running low and can notify you on WhatsApp (once that's configured — ask your developer if it isn't set up yet). Most items use the store-wide threshold (5 units), but you can set a custom threshold per item if it makes sense (e.g. a premium item you only ever stock 2-3 of at a time).

---

## Recording Stock Deliveries (Purchases)

When new stock arrives from a supplier, use **Purchases** instead of manually editing stock — this keeps a proper record of who supplied it, on what invoice, and at what cost.

1. **Purchases** → **"+ New purchase"**.
2. Enter supplier name, invoice number (optional), invoice date.
3. Search for the product, pick the variant, click **Add** — then set the **quantity received** and the **unit cost** on this delivery (pre-filled with the item's current cost, but editable if the price changed).
4. Save.

This automatically: increases stock by the quantity received, updates the article's cost to the new unit cost, and recalculates MRP and MSP — unless either one has been manually locked (see "Manually set MRP" / "Manually set MSP" above), in which case that locked value is left untouched. It also keeps a permanent record you can look back on later.

**Note:** Purchases only works for products that already exist in your catalog — if it's a genuinely new product you've never stocked, create it in Inventory first, then log future deliveries through Purchases.

---

## Stock History

A complete log of every stock change — sales, restocks from cancelled orders, purchases received, and manual adjustments (with the reason you entered). Searchable by product/SKU, filterable by type and date range. Useful for tracing "how did we end up with this stock number."

---

## Managing Users

**Users** lets you create staff/admin accounts and view walk-in customer records (created automatically the first time a customer places an order — these don't have login access, they're just history).

---

## Coupons & Discounts

**Coupons** → **"+ New coupon"**:
- **Code** — what the customer types/tells staff (not case-sensitive).
- **Discount type** — Fixed amount (₹) or Percentage (%).
- **Minimum order value**, **usage limit**, and **expiry date** are all optional.

**Important:** a coupon can never push an item's price below its MSP. If you want an item to actually be discountable, you need to manually lower that item's MSP below its MRP first (see the Inventory section above) — otherwise applying a coupon to that item will succeed but apply **₹0 discount**, which is intentional, not a bug.

Coupons work in both online checkout and walk-in orders. A coupon and a per-item manual discount can't both be applied to the same order — using one disables the other in the walk-in order screen and in Quick Price Check. Deactivate a coupon anytime from this page without deleting it (keeps its usage history).

---

## Quick Price Check

A "Quick Price Check" button appears on the Dashboard (both admin and staff see it). It's for answering "what would this cost?" on the spot — a customer picks up a few frames and wants a price before committing to a purchase, or before deciding between a few options.

Scan (or type) each item's barcode to add it to the running list. Each item has its own discount % field — the price will never go below that item's MSP, the same rule as everywhere else in the app. You can also check a coupon code against the whole list; a coupon and per-item discounts can't be used together, same restriction as checkout.

**Nothing here is saved** — closing the window discards the whole list. If the customer decides to buy, click **"Start walk-in order with these items"** — this opens a real walk-in order with those items already added, so whoever's at the counter just needs to pick or create the customer and continue as normal from there.

---

## Orders — Bulk Actions

On the Orders page, tick the checkboxes next to multiple orders to reveal a bulk action bar: change status for all selected at once (any that aren't eligible for that particular status change will be skipped and reported, not silently failed), or bulk delete. Same pattern on the Inventory page for activating/deactivating/deleting multiple products at once.

---

## Repairs — Admin View

Repair tickets are created and managed by staff (see the Staff Guide's Repairs section for the day-to-day workflow) — as admin, you have the same visibility plus:

- Full visibility into every repair ticket regardless of which staff member created it.
- Ability to adjust the repair fee after creation if needed.

> **Note:** the admin-specific repair capabilities beyond what staff can already do haven't been fully mapped out yet — confirm against the actual `RepairsComponent` whether there's admin-only editing/reporting here beyond what's listed above, and expand this section once confirmed.

---

## Invoices

Once an order exists, click **"Generate invoice"** in that order's detail view (**View → Invoice** section) to create a PDF and deliver it to the customer via WhatsApp automatically, containing a link to view/download it. If you need to update it later (e.g. after a payment or status change), the same section shows **"Regenerate & resend"** instead.

The invoice carries a single barcode encoding the order's own ID (e.g. `ORD-2026-000123`), centered near the bottom of the page — scanning it (or typing the order ID into the Orders search box) pulls that order straight up. It does **not** carry a separate barcode per item; those live only on the physical product tags and inside the order's own detail view (see "Looking Up an Item From a Past Order" in the Staff Guide).

---

## Dashboard

Your at-a-glance view: revenue (today/week/month), order status breakdown, top-selling products, a 7-day revenue trend, recent orders, and low-stock items. Revenue here reflects **actual cash collected**, not just order totals — a cancelled or unpaid order won't inflate this number.

The **"Quick Price Check"** button also lives here — see the section above.

---

## Profit & Loss

**Profit & Loss** shows revenue, refunds, cost of goods sold, and gross profit/margin for any date range. If you see a note about "items with no recorded cost," that means some sold items predate cost tracking being added — their true profit contribution isn't fully known, which is expected for old data, not a bug.

The detailed transaction list below the summary shows every individual payment and refund — searchable by order ID or phone.

---

## Activity Log

A record of every meaningful action taken in the system (who created/edited/deleted what, and when) — useful for accountability and troubleshooting "who changed this."

---

## Order Status Workflow (Reference)