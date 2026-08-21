# Devbhoomi Opticals — Technical Setup Guide

One-time configuration steps for the third-party integrations. This is for whoever manages the deployment (developer or technically-comfortable admin) — not needed for day-to-day store use.

---

## Environment Variables — Full Reference

Set these in Azure App Service (Configuration → Application Settings), not in a local `.env` file, once deployed.

| Variable | Purpose |
|---|---|
| `PORT` | Server port (Azure sets this automatically in most cases) |
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret for signing login tokens — keep private, never commit |
| `JWT_EXPIRES_IN` | How long a login session lasts |
| `CLIENT_ORIGIN` | The deployed frontend's exact URL (for CORS) |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob Storage connection string (product photos) |
| `AZURE_STORAGE_CONTAINER_NAME` | Blob Storage container name |
| `LOW_STOCK_THRESHOLD` | Store-wide default low-stock number (e.g. `5`) |
| `WHATSAPP_ENABLED` | `true` to send real WhatsApp messages; anything else = stub/log-only mode |
| `WHATSAPP_TOKEN` | Meta permanent access token (see below) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp phone number ID — **must belong to the same WhatsApp Business Account (WABA) your templates were created under.** If you have more than one WABA (e.g. a leftover free test account alongside your real business account), double-check this ID matches the right one — a mismatch produces a vague `"API access blocked"` error that looks like a permissions problem but is actually just a wrong ID. |
| `ADMIN_NOTIFY_PHONE` | Phone number that receives low-stock alerts **and critical error alerts** |
| `WHATSAPP_TEMPLATE_ORDER_CREATED` | Approved template name for order confirmations |
| `WHATSAPP_TEMPLATE_STATUS_CHANGED` | Approved template name for order status updates |
| `WHATSAPP_TEMPLATE_PAYMENT_RECEIVED` | Approved template name for payment confirmations |
| `WHATSAPP_TEMPLATE_LOW_STOCK` | Approved template name for low-stock alerts |
| `WHATSAPP_TEMPLATE_CRITICAL_ERROR` | Approved template name for critical system error alerts |
| `WHATSAPP_TEMPLATE_REPAIR_CREATED` | Approved template name for new repair ticket confirmations |
| `WHATSAPP_TEMPLATE_REPAIR_STATUS_CHANGED` | Approved template name for repair status updates |
| `WHATSAPP_TEMPLATE_INVOICE_GENERATED` | Approved template name for invoice-ready notifications |
| `RAZORPAY_KEY_ID` | Razorpay API key ID (test or live) |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Separate secret set when configuring the webhook in Razorpay's dashboard |

---

## Razorpay Setup

### Test Mode (no approval needed — usable immediately)

1. Sign up at razorpay.com, switch to **Test Mode** (top-right toggle in dashboard).
2. Settings → API Keys → Generate Test Key → copy Key ID and Secret into `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
3. Test card: `4111 1111 1111 1111`, any future expiry, any CVV.
4. Test UPI success shortcut: enter `success@razorpay` as the UPI ID when prompted (simulates instant success without a real UPI app). `failure@razorpay` simulates a failed payment.
5. **Enable UPI as a payment method** — Settings → Payment Methods — some new accounts don't have it on by default even in test mode.

### Going Live

1. Complete KYC (business PAN, bank account, business proof) — this is a business/paperwork process with Razorpay, can take days, start it early.
2. Once approved, switch to Live Mode, generate **Live** API keys, replace the test values in your env vars.
3. **Webhook setup** (required for reliable payment confirmation): Razorpay Dashboard → Settings → Webhooks → add your deployed backend's URL:
   ```
   https://<your-backend-domain>/api/payments/razorpay/webhook
   ```
   Set a webhook secret (this becomes `RAZORPAY_WEBHOOK_SECRET`) and subscribe to both `payment.captured` and `qr_code.credited` events.
4. **Testing the webhook locally** (before deployment) requires a tunneling tool like `ngrok` since Razorpay can't reach `localhost` directly:
   ```bash
   ngrok http 5000
   ```
   Use the generated public URL as a temporary webhook target while testing.

---

## WhatsApp (Meta Cloud API) Setup

### Initial Setup

1. Create a **Facebook Business Manager** account at business.facebook.com.
2. Go to developers.facebook.com → My Apps → Create App → choose **"Other"** use case → **Business** type. A Business Portfolio is usually auto-created alongside the app.
3. Add the **WhatsApp** product to the app — this gives you a free test phone number and a `WHATSAPP_PHONE_NUMBER_ID` you can use immediately for early testing.

### Registering Your Real Business Phone Number

4. In **WhatsApp Manager → Phone numbers**, click "Add phone number" and register your actual store number (not the free test number — that's fine for early testing but customers will never receive messages from it).
5. **Warning: if that number has ever had a personal or WhatsApp Business consumer app active on it, you must delete that WhatsApp account first** (on the phone itself: WhatsApp app → Settings → Account → Delete my account → confirm with the OTP that arrives). Skipping this causes registration to fail with *"This phone number is already registered to a WhatsApp account."* Deletion can occasionally take longer than Meta's UI suggests (their message says "up to 3 minutes," but it has taken over 24 hours in practice) — if it's still stuck after a day, contact Meta support rather than repeatedly retrying.
6. **Make sure the correct WABA (WhatsApp Business Account) is selected** in the account switcher (top-right of WhatsApp Manager) before registering — if you have both a free "Test" WABA and your real business WABA, it's easy to accidentally register/view the wrong one. Your phone number, templates, and `WHATSAPP_PHONE_NUMBER_ID` all need to belong to the *same* WABA.

### Generating a Permanent Access Token

7. The default token from "API Setup" expires in ~24 hours — for production, generate a permanent one instead:
   - **Business Settings → Users → System Users → Add** → name it (e.g. `whatsapp-api-backend`), role: **Admin**.
   - After creating it, click **Assign assets** → select **Apps** → check your app → toggle on **"Manage app"** (Full access) → Assign.
   - Note: if this fails with *"Unable to assign assets... visit the developer center to complete confirmation steps,"* go to developers.facebook.com, open your app dashboard, and check for any pending banner/notification (email/phone re-confirmation, ToS acceptance, etc.) — the assignment is silently blocked until that's resolved.
   - Once assigned, click **Generate token** on that system user → select your app → set expiry to **Never** → check both `whatsapp_business_management` and `whatsapp_business_messaging` permissions → Generate.
   - **Copy the token immediately** — Meta only shows it once. This becomes `WHATSAPP_TOKEN`.

### Submitting Message Templates

8. **Business Manager → WhatsApp Manager → Message Templates → Create Template.** Category: **Utility** (transactional, faster approval than Marketing). Language: **English (US)** — and make sure your code's language code matches exactly (`en_US`, not the bare string `"en"` — this is a real and easy-to-hit mismatch since Meta's language codes are locale-specific).

   You need at minimum:
   - **Order created** — `"Hi! Your order {{1}} has been placed successfully. Total amount: ₹{{2}}. Thank you for shopping with Devbhoomi Opticals."`
   - **Order status changed** — `"Update on your order {{1}}: status is now \"{{2}}\". We'll notify you as it progresses."`
   - **Payment received** — `"Payment of ₹{{2}} received for order {{1}}. Remaining balance due: ₹{{3}}. Thank you!"` (note the param order: `{{1}}`=orderId, `{{2}}`=amount paid, `{{3}}`=balance due — this must match the order the backend code actually sends them in)
   - **Low stock alert** — `"Low stock alert: {{1}} item(s) running low — {{2}}. Please restock soon."`
   - **Critical error alert** — `"Critical error detected: {{1}} — occurred on route {{2}}. Please check the admin panel."`
   - **Repair created** — `"Hi! Your repair ticket {{1}} has been created for your {{2}}. {{3}}. We'll notify you as soon as it's ready for pickup."`
   - **Repair status changed** — `"Hi! We have an update on your repair ticket {{1}} for your {{2}}. The current status has changed to: \"{{3}}\". Thank you for choosing Devbhoomi Opticals for your repair needs."`
   - **Invoice generated** — `"Your invoice for order {{1}} is ready. View it here: {{2}}. Thank you for shopping with Devbhoomi Opticals."`

   **Template validation quirks to know in advance:**
   - A variable can never be the very first or very last thing in the body — there must be static text on both ends, or Meta rejects it with *"Variables can't be at the start or end of the template."*
   - Short bodies with 3 variables and little surrounding text get rejected with *"too many variables for its length"* — pad with more natural wording (as done above for the repair templates) rather than removing a variable your code actually needs.
   - Leave Header, Footer, and Buttons completely untouched/blank unless your code actually sends values for them — Meta requires every defined template component to receive a value at send-time, so an accidentally-touched-then-cleared Header field can silently leave behind an invalid empty component and cause a confusing `"component of type HEADER is missing expected field(s)"` error on submission. If that happens, don't try to fix the existing draft — discard it and recreate the template from scratch without ever clicking into the Header field.

9. Approval typically takes minutes to a few hours for Utility templates from verified businesses — but can take 24–72 hours for a brand-new, unverified WABA. See Business Verification below; it's not just about messaging limits, it also appears to affect review speed.

10. Once approved, put the exact approved template names into the `WHATSAPP_TEMPLATE_*` env vars, set `WHATSAPP_ENABLED=true`, and restart the backend. Until templates are approved, sending will fail with `"API access blocked"` (error code 200, `OAuthException`) — this specific error, with no other configuration issue present, usually just means the template isn't approved yet, not that something is broken.

### Business Verification

11. **Business Settings → Security Centre → Start verification.** You'll need: legal business name, address, phone number, and typically a supporting document (GST certificate, Udyam/MSME registration, trade license, or shop establishment certificate). Recommended to start this early — verified businesses appear to get both higher messaging limits *and* faster template review, so an unverified account may explain unusually slow approvals.

### Payment Method

12. **WhatsApp Manager → Payment configurations → India → add a payment method.** Required before you exceed the free conversation tier — worth doing before going live even if you're still in the free allowance, so it's not a surprise blocker later.

---

## Barcode Label Printing (QZ Tray + DP27)

Label printing (both the 50×50mm box label and the dumbbell-shaped frame/tag label) does **not** go through the browser's normal print dialog — it's sent from the frontend to **QZ Tray**, a small local agent that must be running on whichever computer is physically connected to the label printer, which then forwards the job to the printer. If printing silently does nothing, or the app reports it can't connect, this local setup — not the web app itself — is almost always where to look first.

### One-time setup on the printing computer

1. Install **QZ Tray** (download from qz.io) on the computer connected to the printer. It needs to be running (usually via its system tray icon) whenever labels are printed — it's a background agent, not something staff open and interact with directly.

   > **Note to whoever finalizes this guide:** confirm and document here whether this deployment's QZ Tray install uses a signed certificate (so the one-time "unsafe website wants to access..." browser permission prompt is trusted automatically) or the default unsigned setup (where that prompt has to be clicked through — and may reappear if it's ever dismissed with "always block" by mistake). Fill in the actual steps taken, since this determines what a staff member sees the first time printing is used on a new/reset computer.

2. Install the **DP27 label printer**'s driver on that same computer and confirm it appears in the OS's printer list.

3. **The printer must be named exactly `DP27 Label Printer` in the OS printer list** — this exact string is hardcoded into the app's print configuration for both label types. If Windows (or whichever OS) installs it under a different name, either rename it to match in the printer settings, or this needs a small code change to match whatever name it actually installed under.

4. Load the label stock: 50×50mm square sticker stock for box labels, or the 3-lane-wide dumbbell/tag roll (each lane 15mm wide, 100mm long, with a pre-cut scissor perforation at the midpoint of the printable head) for frame labels. These likely need to be swapped depending which label type is in use, unless separate printers are set up for each.

### The two label types

- **Box label** — 50×50mm square, contents stacked top-to-bottom (store name, product, variant, then barcode). Straightforward — no calibration needed.
- **Frame/tag label** — the dumbbell/barbell-shaped tag meant to be tied onto a frame. Physically: a 6.4cm-long printable "head," with a scissor-cut at its exact midpoint (3.2cm in), splitting it into a text zone and a barcode zone, followed by a blank neck (narrower than the head) and loop for string. Printed 3 tags across per row, matching the roll's 3-lane width.

### Frame label calibration (only needed if the printer, stock, or roll changes)

These fields live in the print modal (frame mode) and are normally left alone once tuned for the current roll of stock — they were calibrated against physically measured labels, not guessed:

| Field | What it controls |
|---|---|
| Text zone (cm) | Length of the text (brand/product/variant) portion of the head, measured from the leading edge |
| Cut gap (cm) | Blank buffer straddling the scissor-cut perforation, split evenly across it |
| Barcode zone (cm) | Length of the barcode portion of the head, immediately after the cut gap |
| Head total length (cm) | Full length of the printable head (measured on this stock: 6.4cm) |
| Gap between lanes (cm) | Blank spacing between the 3 side-by-side lanes on the roll |
| Content prints first (leading edge) | Whether the printed head lands at the leading or trailing edge as the tag feeds through the printer — leave checked unless prints come out mirrored/upside-down |
| Barcode nudge (cm) | Small manual shift of just the barcode, independent of the zone fields above, for fine-tuning after the zone fields are already close |
| Text nudge (cm) | Same idea, for the text block |
| Single print — lane (1/2/3) | Which physical lane a single (non-bulk) print targets — used to reuse a lane a previous bulk print left blank |

**Important constraint:** Text zone + Cut gap must always add up to the real physical position of the scissor-cut on the stock (measured at 3.2cm from the leading edge on this roll). Changing Text zone or Cut gap without preserving that relationship will make the barcode start before or after the actual cut, not just move it within its own zone. If the label stock is ever replaced with a different roll, re-measure the physical cut position first, then set Text zone + half the Cut gap to match it, before touching anything else.

**If a barcode won't scan:** this is very unlikely to be a bar-width/size issue at the current settings — narrower rendering was tried and made things worse, because CODE128 barcodes need a blank "quiet zone" on each side to be found by the scanner at all, and thermal print has a real minimum resolvable bar width (roughly 2px at this printer's ~203dpi). If scanning issues come back after a stock or printer change, check quiet zone and minimum bar width before assuming it's a positioning problem.

---

## Error Monitoring

The system automatically catches and logs unexpected errors — no third-party service (like Sentry) is used; everything is stored in your own MongoDB database and viewable from the admin **Error Log** page.

### How it works

- **Backend:** every controller already funnels unexpected failures through Express's global error handler (`middleware/errorHandler.js`). Any error that results in a 5xx response is automatically logged — no per-route setup needed, this covers the whole app.
- **Frontend:** Angular's global error handler (`core/services/global-error-handler.ts`) catches any uncaught exception in the browser and reports it to the backend, logged the same way.
- Both are stored in the `ErrorLog` collection and viewable at **Admin → Error Log**, with search and source (backend/frontend) filtering.

### What does NOT get logged

Expected, deliberate errors — form validation failures, business-rule rejections (e.g. "coupon already used," "not enough stock") — are **not** logged here. Only genuine 5xx failures (unexpected crashes) show up, keeping the log meaningful instead of full of routine rejections.

### WhatsApp Alerts on Critical Errors

Whenever a critical (5xx) error is logged, the system also attempts a WhatsApp alert to `ADMIN_NOTIFY_PHONE` using the `WHATSAPP_TEMPLATE_CRITICAL_ERROR` template.

**Cooldown:** to avoid being flooded with messages during an outage (e.g. if the database goes down and every request fails), alerts are limited to **one per 15 minutes**. Every error still gets logged to the Error Log regardless of the cooldown — only the WhatsApp *notification* is throttled, not the record-keeping.

### Testing This Yourself

If you ever need to verify this is still working after a deployment change: temporarily add `throw new Error("TEST: ...")` at the top of any controller function, reload the corresponding page once, confirm it appears in Error Log, then **remove the test line immediately** — never leave a forced error in deployed code.

---

## Deployment Notes (Reference)

- Backend: Azure App Service — confirm **"Always On"** is enabled (Configuration → General Settings) if using the daily low-stock cron job, otherwise Azure may idle the app between requests and the scheduled check won't fire.
- Frontend: Azure Static Web Apps.
- Database: MongoDB Atlas — confirm automated backups are enabled on your plan tier.
- CORS: `CLIENT_ORIGIN` must exactly match the deployed frontend URL, not localhost, once live.
- **Network note:** if WhatsApp API calls fail with a generic `"fetch failed"` (not a structured JSON error from Meta) while testing locally, this can be an ISP-level block on `graph.facebook.com` rather than a code/config issue — some Indian ISPs have been observed resetting connections to this specific domain while leaving normal Facebook/WhatsApp browsing traffic unaffected. Test with `curl -i https://graph.facebook.com/v20.0/` — a real (even error) JSON response means connectivity is fine; a connection reset means it's network-level. This has not been observed as an issue on Azure's own outbound network, only certain home ISPs during local development.
- **Label printing is entirely local to the printing computer** (QZ Tray + the DP27 driver) — it isn't affected by Azure deployment at all, and doesn't need any env var. It only matters at the physical store, on whichever computer is connected to the printer.