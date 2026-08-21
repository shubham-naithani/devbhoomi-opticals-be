# Devbhoomi Opticals — Pre-Launch Test Checklist

Work through this in order — later sections (Repairs, WhatsApp) depend on data created in earlier ones (a real order, a real customer). Check items off as you go; anything that fails, note it separately rather than trying to fix mid-test.

---

## 1. Auth & Access Control

- [ ] Login with admin account → lands on Dashboard with full sidebar (Users, Coupons, P&L, Error Log, etc. all visible)
- [ ] Login with staff account → lands on "Welcome back" quick-actions view (not the admin dashboard), sidebar shows only staff-relevant items (no Users, Coupons, P&L, Error Log)
- [ ] Staff manually types `/users`, `/pnl`, `/coupons`, `/error-log` in the URL bar → redirected away, not shown the page
- [ ] Staff manually types `/dashboard` → redirected, doesn't see admin dashboard
- [ ] Logout → redirected to login, and browser back button doesn't re-show a protected page
- [ ] Wrong password → clear error shown, no crash
- [ ] Refresh the page while logged in → stays logged in (session persists), doesn't bounce to login

---

## 2. Walk-In Order — New Order Flow

- [ ] Start a new walk-in order, search an existing customer's phone number → their name appears, "Use this customer" works
- [ ] Search a phone number that doesn't exist → "Create customer" flow works, new customer has no password (can't log in with it later — confirm this is expected)
- [ ] Skip eye test entirely → order proceeds without one
- [ ] Add an eye test with readings for both eyes + pupillary distance → saves correctly
- [ ] Add an item by scanning/typing a barcode → correct item added
- [ ] Add an item by searching name/brand → correct variant selectable when multiple colors/sizes exist
- [ ] Adjust quantity with +/− → total recalculates correctly
- [ ] Remove an item → total recalculates, stock isn't affected until order is confirmed
- [ ] Apply a valid coupon → discount applied correctly
- [ ] Apply a coupon to an item at its MSP floor (not manually unlocked) → discount applies as ₹0, not an error (confirm this matches intended behavior, not a bug)
- [ ] Pay full amount in one method (Cash) → confirms cleanly
- [ ] Pay partial amount (less than total) → remaining balance shown correctly, order still confirms
- [ ] Overpay in cash (e.g. ₹500 for a ₹450 total) → correct change shown, revenue recorded as ₹450 not ₹500
- [ ] Confirm order → stock decreases by the correct quantity for each item sold
- [ ] Confirm order → customer receives WhatsApp order-confirmation message (see WhatsApp section below)
- [ ] Start an order, navigate away mid-flow, come back to "New walk-in order" → prompted to resume, and resuming restores exactly where you left off

---

## 3. Walk-In Order — Repair Flow

- [ ] Switch to "Repair" tab within walk-in order → correct form shown
- [ ] Create a repair ticket with a fee → ticket created, correct fee recorded
- [ ] Create a repair ticket marked free/under warranty → ticket created with ₹0 fee, correct wording shown
- [ ] Customer receives WhatsApp repair-created confirmation
- [ ] Go to **Repairs** page → new ticket appears in the list
- [ ] Change repair status: Received → In Progress → Ready for Pickup → Collected → each step allowed only in sequence, each triggers a WhatsApp status update
- [ ] Cancel a repair ticket before it's Collected → allowed
- [ ] Try to change status on a Collected or Cancelled ticket → blocked (these are final states)

---

## 4. Orders Management

- [ ] Orders list shows both walk-in and (if applicable) online orders
- [ ] Search by order ID → correct result
- [ ] Search by phone number → correct result(s)
- [ ] Filter by status → only matching orders shown
- [ ] View an order → all details correct (items, payments, customer)
- [ ] Move order through full status sequence (Pending → Confirmed → In Progress → Ready to Pick Up → Delivered) → each step sends a WhatsApp update, skipping ahead is blocked
- [ ] Cancel an order before Delivered → allowed
- [ ] Try to change status after Delivered or Cancelled → blocked
- [ ] Record an additional payment on a partially-paid order → balance updates correctly, WhatsApp payment confirmation sent
- [ ] Overpay on an additional payment → correct change shown
- [ ] Cancel an order that had payment collected → "Refund needed" section appears
- [ ] Refund now → refund recorded immediately
- [ ] Mark refund as pending → then later "Settle refund" → completes correctly
- [ ] Bulk-select multiple orders → bulk status change works, ineligible ones reported (not silently skipped) rather than causing an error
- [ ] Bulk delete → works as expected

---

## 5. Inventory (Admin)

- [ ] Add a new product with a new brand → "Add as new brand" appears and works
- [ ] Add a new product under an existing brand → auto-fill of category/frame type/gender behaves sensibly
- [ ] Enter cost price → MRP auto-calculates as Cost × 1.25, field is not editable directly
- [ ] Default MSP calculates as Cost × 1.40
- [ ] Check "Manually set MSP" and enter a custom value below MRP → saves, and this item is now discountable up to that gap
- [ ] Save product → barcode auto-generated
- [ ] Add a second variant (color/size) to the same product → works, own cost/MRP/MSP/stock
- [ ] Manually edit stock (not via Purchases) → prompted for a reason, and that reason shows up later in Stock History
- [ ] As staff (not admin) → confirm inventory is view-only, no edit/add/delete controls available

### Barcode Label Printing

- [ ] QZ Tray is running and the DP27 Label Printer is reachable on the printing computer before starting these tests — confirm printing fails with a clear message (not a silent no-op) if QZ Tray is stopped
- [ ] Print a **Box label** (single item) → preview matches, physical print comes out correctly, barcode scans
- [ ] Print a **Frame/tag label** (single item) → text sits clearly clear of the scissor-cut, barcode starts clearly after the scissor-cut, barcode scans correctly
- [ ] **Bulk print** 3 frame items → all 3 lanes print the correct item each, correctly separated
- [ ] **Bulk print** 2 frame items (not a multiple of 3) → 2 lanes print correctly, 3rd lane left blank (not a wrong/duplicate label)
- [ ] **Single print with lane targeting**: after the 2-item bulk print above, single-print a 3rd item targeting lane 3 → lands in the correct physical lane, on the same partially-used row
- [ ] Reprint the same item twice → barcode value is identical both times (confirms it's reading the stored barcode, not regenerating one)
- [ ] Scan a freshly printed barcode with the actual store scanner (not just visual inspection) → correct item comes up
- [ ] Try the barcode/text nudge fields → reprint after a change → shift is visible in the expected direction

---

## 6. Purchases (Stock Deliveries)

- [ ] New purchase: enter supplier, invoice number/date, add an existing product+variant, set quantity received and unit cost
- [ ] Save → stock increases by quantity received
- [ ] Save → item's cost updates to new unit cost, MRP recalculates accordingly
- [ ] If MSP was manually locked, confirm it does NOT recalculate (stays at the locked value)
- [ ] If MSP was NOT manually locked, confirm it DOES recalculate off the new cost
- [ ] Try to log a purchase for a product that doesn't exist yet → confirm it's blocked/guided to create the product in Inventory first

---

## 7. Stock History

- [ ] Every action above (sale, purchase, manual adjustment, cancelled-order restock) shows up here with the correct type
- [ ] Manual adjustments show the reason you entered
- [ ] Search by product/SKU works
- [ ] Filter by type and date range works

---

## 8. Coupons

- [ ] Create a fixed-amount coupon, a percentage coupon → both apply correctly at checkout
- [ ] Minimum order value enforced if set
- [ ] Usage limit enforced (coupon stops working after limit reached)
- [ ] Expired coupon → correctly rejected
- [ ] Deactivate a coupon → stops working immediately, but its past usage history is still visible/intact
- [ ] Coupon applied to an item below its MSP floor → ₹0 discount applied (not an error) — confirm again in this context, since it's easy to miss

---

## 9. Users (Admin)

- [ ] Create a new staff account → correct role, can log in, correct restricted access per section 1
- [ ] Create a new admin account → correct role, full access
- [ ] Edit an existing user → changes save correctly
- [ ] Delete a user → removed from list (confirm what happens to their historical activity log entries — should remain, not be deleted with them)
- [ ] Walk-in customers created during orders show up here as customer records (no password/login)

---

## 10. Dashboard (Admin)

- [ ] Revenue today/week/month reflects actual cash collected, not order totals (test with a cancelled order → confirm revenue is unaffected)
- [ ] Revenue chart, order status donut, and top products chart populate correctly once real orders exist (they'll be empty on a fresh install — that's expected, not a bug)
- [ ] Low stock count matches actual number of items at or below their threshold
- [ ] Recent orders list shows correct latest orders with correct status badges (color-coded correctly per status)
- [ ] Low stock items list shows correct items, "0 left" items visually distinct from low-but-nonzero items

---

## 11. Profit & Loss (Admin)

- [ ] Select different date ranges (today/week/month/custom) → figures update correctly
- [ ] Filter by transaction type (payments only / refunds only) → list filters correctly
- [ ] Gross profit and margin % calculate correctly against known test data
- [ ] "Items missing cost" note appears only when relevant (old pre-cost-tracking sales), doesn't appear for normal current data
- [ ] Transaction list searchable by order ID and phone

---

## 12. Activity Log & Error Log (Admin)

- [ ] Activity Log shows a clear record for major actions (create/edit/delete on products, orders, users)
- [ ] Error Log shows only genuine 5xx errors — confirm a normal validation error (e.g. wrong coupon code) does NOT appear here
- [ ] Trigger a real test error (temporary `throw new Error(...)` per the Technical Setup Guide) → confirm it appears in Error Log, then remove the test code immediately afterward

---

## 13. WhatsApp Notifications (all 8, once templates are Active)

For each, confirm the message actually arrives on a real phone and the wording/variables render correctly (no literal `{{1}}` showing, no missing values):

- [ ] `order_created` — after confirming a walk-in order
- [ ] `order_status_changed` — after changing an order's status
- [ ] `payment_received` — after recording a payment (both full and partial)
- [ ] `low_stock_alert` — after the daily check runs (or trigger manually if there's a way to test on demand) — sent to `ADMIN_NOTIFY_PHONE`
- [ ] `critical_error_alert` — after the test-error trigger above — sent to `ADMIN_NOTIFY_PHONE`, and confirm the 15-minute cooldown actually suppresses a second alert if triggered twice quickly
- [ ] `repair_created` — after creating a repair ticket
- [ ] `repair_status_changed` — after changing a repair ticket's status
- [ ] `invoice_generated` — once you've confirmed exactly where/how this triggers in the UI (see the open question in the Admin Guide)

---

## 14. UI / Branding

- [ ] Browser tab shows the correct favicon (mountain+glasses mark), not a generic default icon
- [ ] Sidebar, buttons, and badges use the red accent consistently (no leftover copper/orange anywhere)
- [ ] Logo renders at correct proportions in the sidebar and on the login/register screens (no squishing, no excess whitespace)
- [ ] Login screen looks balanced on a large monitor (no lopsided empty space on one side)
- [ ] Resize browser down to phone width → sidebar/layout adapts sensibly, login screen stacks cleanly, nothing overlaps or overflows

---

## 15. Cross-Cutting / Edge Cases

- [ ] Two staff members working simultaneously on different walk-in orders → no interference between sessions
- [ ] Create an order, then immediately check Dashboard/P&L in another tab → numbers reflect it (or note if there's a caching delay)
- [ ] Slow/unstable network (throttle in devtools) → forms don't silently fail; loading states show correctly
- [ ] Try submitting a form with required fields empty → clear validation messages, no crash, no silent failure
- [ ] Stop QZ Tray (or unplug the DP27) mid-session, then try to print → app reports the failure clearly rather than hanging or silently doing nothing