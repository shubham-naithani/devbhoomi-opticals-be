# Devbhoomi Opticals — Staff Guide

This guide covers everything a **staff** account can do. If you're an admin, also read the Admin Guide for the additional management features.

---

## Logging In

1. Go to the store's website address.
2. Enter your phone/email and password.
3. You'll land on the **Dashboard**, which shows quick links to your main tasks.

---

## Creating a Walk-In Order

This is the main thing you'll do all day. Click **"New walk-in order"** in the sidebar. The process has 4 steps, shown as tabs at the top — you can click a completed step to go back, but you can't skip ahead until each step is done.

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

### If You Get Interrupted Mid-Order

If another customer walks in while you're partway through an order, it's safe to just navigate away — the app remembers your progress on this browser/computer. When you come back to "New walk-in order," it'll ask if you want to resume where you left off.

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

### Recording an Additional Payment

If a customer paid a partial amount earlier and comes back to pay the rest:
1. Open the order (**View**).
2. In the "Record a payment" box, enter the amount they're paying now.
3. Click **Record**. If they overpay, you'll be shown the change to give back — same as at checkout.

### If a Customer Wants a Refund

If an order gets **cancelled** and money was already collected on it, a **"Refund needed"** section will appear when you view that order:
- **"Refund now"** — if you're handing the cash back immediately, enter the amount and confirm.
- **"Mark as pending"** — if the refund will happen later (e.g. bank transfer to process), mark it pending for now, then come back and **"Settle refund"** once it's actually done.

---

## Checking Inventory

Go to **Inventory** to browse products. You can search by name, brand, SKU, or barcode, and filter by category/gender/frame shape. As staff, you can **view** stock levels and details but can't edit prices or add/remove products — that's admin-only.

---

## A Few Things to Keep in Mind

- **Prices (MRP) are set automatically** based on cost — you'll never need to calculate this yourself.
- **Every order automatically updates stock** — no manual stock adjustment needed for normal sales.
- If something looks wrong (a price, a stock number, an order stuck in the wrong status), flag it to the admin rather than trying to force a workaround — several numbers in the system (revenue, profit reports) depend on things being recorded consistently.
