# Devbhoomi Opticals — Staff Guide

This guide covers everything a **staff** account can do. If you're an admin, also read the Admin Guide for the additional management features.

---

## Logging In

1. Go to the store's website address.
2. Enter your phone/email and password.
3. You'll land on the **Dashboard**, which shows quick links to your main tasks.

---

## Creating a Walk-In Order

This is the main thing you'll do all day. Click **"New walk-in order"** in the sidebar. You'll see two tabs at the top: **"New Order"** and **"Repair"** — pick the one that matches what the customer needs. The steps below cover a New Order; see **Repairs** further down for repair tickets.

The New Order process has 4 steps, shown as tabs at the top — you can click a completed step to go back, but you can't skip ahead until each step is done.

### Step 1 — Customer

- Type the customer's **phone number** and hit Search.
- If they've ordered before, their name will show up — click **"Use this customer"**.
- If it's a new customer, fill in their name and phone (email is optional) and click **"Create customer"**.
- New customers created this way don't get a password — they're just a record for order history. They can set one up later if they want to log in online themselves.

### Step 2 — Eye Test

- If the customer has a prescription on file, you'll see it here with an option to **"Use this prescription"**.
- If they need a new test, click **"Record a new test instead"** and fill in the readings for both eyes, plus pupillary distance if measured.
- **Eye tests are optional** — if the customer doesn't need one right now, click **"Skip for now"** to move on.

### Step 3 — Items

You can add items two ways:

**Scan a barcode** (fastest): click into the "Scan barcode..." box and scan the tag with the barcode scanner — the item gets added automatically. You can also type the barcode number in manually if the scanner isn't handy.

**Search by name**: type the product name or brand and hit Search. If a product has multiple colors/sizes, pick the right one from the dropdown before clicking **Add**.

Once items are added, you can adjust quantity with the +/− buttons, or remove an item entirely.

### Step 4 — Payment & Confirm

- Review the order total.
- Pick the **payment method** (Cash, Card, UPI, or COD if it's a later pickup).
- The **"Amount received now"** field defaults to the full total. If the customer is only paying part now (an advance/deposit), lower this number — it'll show you the remaining balance due.
- If the customer hands over more cash than the total (e.g. paying ₹500 for a ₹450 bill), type the actual amount they gave you — the system will tell you how much **change to give back**, and this won't be counted as extra revenue.
- If you have a coupon code from the customer, enter it here — the discount (if the item qualifies) will be applied automatically.
- Click **"Confirm order"**.

Once confirmed, the customer receives a WhatsApp confirmation automatically (if WhatsApp is configured — ask your admin/developer if you're not sure).

### If You Get Interrupted Mid-Order

If another customer walks in while you're partway through an order, it's safe to just navigate away — the app remembers your progress on this browser/computer. When you come back to "New walk-in order," it'll ask if you want to resume where you left off.

---

## Repairs

Use the **"Repair"** tab within "New walk-in order" to log a new repair ticket, or go to **Repairs** in the sidebar to view and manage all existing repair tickets.

### Creating a Repair Ticket

1. **Customer** — search for or select the customer, or create a new one, just like in a New Order.
2. **Item** —
   - **Scan the item's barcode** if the customer still has it, or search for their original invoice. This links the repair to the original purchase (and its warranty, if still valid).
   - If the item **can't be matched to an invoice** — it wasn't bought here, or the invoice can't be found — use **"Add the item without an invoice"** instead and describe the item manually. Repairs added this way don't have a purchase-linked warranty attached, so let the customer know that up front.
   - Need to pick a different item after this step? Use **Change item** — it takes you back to item selection without losing your progress on the customer step.
3. **Issue & fee** — describe the problem and add any notes that'll help whoever does the repair. Enter the **repair fee**, if any — leave at ₹0 (or mark as under warranty) if the repair is free. Use **← Back** if you need to return to the item step.
4. Click **"Create repair ticket"**. The customer receives a WhatsApp confirmation with the ticket number, item, and fee (if WhatsApp is configured).

Like a New Order, an in-progress repair ticket is saved if you leave the page — you can resume it, or use **Start over** to clear it and begin again.

### Starting a Repair From an Existing Order

If a customer is already looking at (or you're pulling up) one of their past orders, you don't have to start a repair ticket from scratch: open the order and use the **Repair** action on the specific item they want serviced. It jumps straight into the Repair flow with the customer, order, and item already filled in.

### Repair Status Workflow

Repair tickets move through their own sequence, separate from order statuses:
```
Received → In Progress → Ready for Pickup → Collected
```
Cancelled is available at any point before Collected. Each status change sends the customer a WhatsApp update automatically (if configured).

### Managing Repairs

Go to **Repairs** in the sidebar to see all repair tickets — searchable and filterable the same way as Orders. Update a ticket's status as work progresses; the customer is notified at each step.

---

## Managing Orders

Go to **Orders** in the sidebar to see every order — walk-in and online.

- **Search** by order ID or phone number.
- **Filter** by status using the dropdown.
- Click **View** on any order to see full details: items, payment history, customer info.

### Updating Order Status

Each order moves through a fixed sequence:
```
Pending → Confirmed → In Progress → Ready to Pick Up → Delivered
```
You can only move an order to the **next** valid step — the dropdown will only show options that make sense from wherever the order currently is. **Cancelled** is available at any point before Delivered. Once an order is Delivered or Cancelled, its status can't be changed anymore.

Each status change sends the customer a WhatsApp update automatically (if configured).

### Recording an Additional Payment

If a customer paid a partial amount earlier and comes back to pay the rest:
1. Open the order (**View**).
2. In the "Record a payment" box, enter the amount they're paying now.
3. Click **Record**. If they overpay, you'll be shown the change to give back — same as at checkout. The customer receives a WhatsApp payment confirmation automatically (if configured).

### If a Customer Wants a Refund

If an order gets **cancelled** and money was already collected on it, a **"Refund needed"** section will appear when you view that order:
- **"Refund now"** — if you're handing the cash back immediately, enter the amount and confirm.
- **"Mark as pending"** — if the refund will happen later (e.g. bank transfer to process), mark it pending for now, then come back and **"Settle refund"** once it's actually done.

---

## Checking Inventory

Go to **Inventory** to browse products. You can search by name, brand, SKU, or barcode, and filter by category/gender/frame shape. As staff, you can **view** stock levels and details but can't edit prices or add/remove products — that's admin-only. Each item also shows whether it's **Active** or **Hidden** (discontinued) — this is view-only for staff. A Hidden item can still be looked up (e.g. in Quick Price Check) but cannot be added to a new order.

---

## A Few Things to Keep in Mind

- **Prices (MRP) are set automatically** based on cost — you'll never need to calculate this yourself.
- **Every order automatically updates stock** — no manual stock adjustment needed for normal sales.
- If something looks wrong (a price, a stock number, an order stuck in the wrong status), flag it to the admin rather than trying to force a workaround — several numbers in the system (revenue, profit reports) depend on things being recorded consistently.
- Discontinued items are intentionally still visible in lookups like Quick Price Check (so you can still answer a customer's question) but cannot be sold through New Order — if "Start walk-in order" from Price Check seems to skip an item, that's expected: it only carries over items that are still active.