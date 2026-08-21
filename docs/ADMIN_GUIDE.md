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
   - **MRP** — calculated automatically as Cost × 1.25. You can't edit this directly — it always follows cost.
   - **MSP (minimum selling price)** — calculated automatically as Cost × 1.40 by default. This is a **discount floor**: no one can sell below this price, whether through a coupon or a manual price change at the counter. If you want to allow discounting on a specific item, check **"Manually set MSP"** and enter a value *below* the MRP — the gap between MRP and your custom MSP is how much discount that item can ever receive.
   - **Stock** and **low stock alert threshold** (optional — leave blank to use the store-wide default of 5).
6. Add photos (up to 6), save.

A **barcode is generated automatically** the moment you save — no need to enter one yourself.

### Adding More Variants (Colors/Sizes) to an Existing Product

Open the product → **"Manage variants"** → **"+ Add variant"**. Same fields as above.

### Editing an Existing Variant

**If you're only changing stock manually** (not through a supplier delivery — see Purchases below), you'll be asked for a **reason** the moment you change the stock number. This is required — it's what makes the Stock History page useful later ("why did this change?").

### Printing a Barcode Label

In "Manage variants," click **"Print label"** on any variant that has a barcode. This opens a print modal with a live preview — pick the label type, check the preview, then click **Print**.

There are two label types:

- **Box label** — a 50×50mm square label, everything (store name, product, variant, barcode) stacked top to bottom on one sticker.
- **Frame/tag label** — the dumbbell-shaped tag meant to be tied onto a frame with string: brand/product/variant text on one end, a scissor-cut in the middle, and the barcode on the other end. These print 3-across on the roll (the printer's stock is 3 lanes wide).

Both label types print through the **DP27 Label Printer** — there's no more "or print on a regular printer" fallback; both go through the same dedicated label printer (see the Technical Setup Guide for what needs to be running on the printing computer for this to work — if Print does nothing or errors out, that's the first thing to check).

**Bulk printing:** from the Inventory list, select multiple variants and choose the bulk print option. Frame labels fill lanes left-to-right, 3 per row — if the last row doesn't divide evenly (e.g. you printed 2 items), the 3rd lane in that row is left blank rather than wasted on a partial/incorrect label.

**Single print + reusing a leftover lane:** if a previous bulk print left a lane blank (as above), or you just need to reprint one item, use the single-print option and set the **lane number (1, 2, or 3)** field to target that exact physical lane instead of starting a fresh row and wasting the other two.

> **Note to whoever finalizes this guide:** confirm whether the "Print label" button is visible to staff accounts too, or admin-only as the current guide structure assumes — if staff also use it day to day, move this section (or a summary of it) into the Staff Guide as well.

### Low Stock Alerts

Every morning, the system checks for anything running low and can notify you on WhatsApp (once that's configured — ask your developer if it isn't set up yet). Most items use the store-wide threshold (5 units), but you can set a custom threshold per item if it makes sense (e.g. a premium item you only ever stock 2-3 of at a time).

---

## Recording Stock Deliveries (Purchases)

When new stock arrives from a supplier, use **Purchases** instead of manually editing stock — this keeps a proper record of who supplied it, on what invoice, and at what cost.

1. **Purchases** → **"+ New purchase"**.
2. Enter supplier name, invoice number (optional), invoice date.
3. Search for the product, pick the variant, click **Add** — then set the **quantity received** and the **unit cost** on this delivery (pre-filled with the item's current cost, but editable if the price changed).
4. Save.

This automatically: increases stock by the quantity received, updates the article's cost to the new unit cost, and recalculates MRP (and MSP, unless you've manually locked it). It also keeps a permanent record you can look back on later.

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

Coupons work in both online checkout and walk-in orders. Deactivate a coupon anytime from this page without deleting it (keeps its usage history).

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

Once an order is confirmed, an invoice can be generated and delivered to the customer via WhatsApp automatically, containing a link to view/download it.

> **Note:** the exact trigger for invoice generation (automatic on order confirmation vs. a manual "Generate invoice" action) and where that link/action lives in the admin UI needs to be confirmed and documented here — the backend capability exists (`WHATSAPP_TEMPLATE_INVOICE_GENERATED`), but the admin-facing trigger point isn't yet described in this guide.

---

## Dashboard

Your at-a-glance view: revenue (today/week/month), order status breakdown, top-selling products, a 7-day revenue trend, recent orders, and low-stock items. Revenue here reflects **actual cash collected**, not just order totals — a cancelled or unpaid order won't inflate this number.

---

## Profit & Loss

**Profit & Loss** shows revenue, refunds, cost of goods sold, and gross profit/margin for any date range. If you see a note about "items with no recorded cost," that means some sold items predate cost tracking being added — their true profit contribution isn't fully known, which is expected for old data, not a bug.

The detailed transaction list below the summary shows every individual payment and refund — searchable by order ID or phone.

---

## Activity Log

A record of every meaningful action taken in the system (who created/edited/deleted what, and when) — useful for accountability and troubleshooting "who changed this."

---

## Order Status Workflow (Reference)

```
Pending → Confirmed → In Progress → Ready to Pick Up → Delivered
```
- Cancelled is allowed from any point before Delivered.
- Delivered and Cancelled are both final — no further changes once reached.
- This applies the same way whether changing one order or using bulk status update.

**Repair tickets use a separate workflow** — see the Staff Guide's Repairs section:
```
Received → In Progress → Ready for Pickup → Collected
```

---

## A Note on Pricing Logic

Since this comes up often: **MRP is never something you type in directly** — it's always Cost × 1.25, automatically. If you want a different customer-facing price, the way to do that is by adjusting the **cost price**, which then recalculates MRP for you. This keeps pricing consistent and avoids MRP silently drifting away from actual cost over time.