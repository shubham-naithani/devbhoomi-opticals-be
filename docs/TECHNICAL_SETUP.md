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
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp phone number ID |
| `ADMIN_NOTIFY_PHONE` | Phone number that receives low-stock alerts |
| `WHATSAPP_TEMPLATE_ORDER_CREATED` | Approved template name for order confirmations |
| `WHATSAPP_TEMPLATE_STATUS_CHANGED` | Approved template name for status updates |
| `WHATSAPP_TEMPLATE_PAYMENT_RECEIVED` | Approved template name for payment confirmations |
| `WHATSAPP_TEMPLATE_LOW_STOCK` | Approved template name for low-stock alerts |
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

1. Create a **Facebook Business Manager** account at business.facebook.com.
2. Go to developers.facebook.com → My Apps → Create App → choose **Business** type, link it to your Business Account.
3. Add the **WhatsApp** product to the app — this gives you a free test phone number and a `WHATSAPP_PHONE_NUMBER_ID`.
4. **Generate a permanent access token** (the default one expires in 24 hours):
   - Business Settings → System Users → create a new System User
   - Assign it the WhatsApp app with messaging permissions
   - Generate a token for that System User with **no expiration** → this is `WHATSAPP_TOKEN`
5. **Submit message templates** for approval (Business Manager → WhatsApp Manager → Message Templates). Category: **Utility** (transactional, faster approval than Marketing). You need at minimum:
   - Order created — e.g. `"Your order {{1}} has been placed! Total: ₹{{2}}"`
   - Order status changed — e.g. `"Update on your order {{1}}: your order is now \"{{2}}\"."`
   - Payment received — e.g. `"Payment of ₹{{2}} received for order {{1}}."`
   - Low stock alert — e.g. `"⚠️ Low stock alert: {{1}} item(s) running low — {{2}}."`
   - Approval typically takes 24–48 hours. Once approved, put the exact approved template names into the `WHATSAPP_TEMPLATE_*` env vars.
6. Set `WHATSAPP_ENABLED=true` only once templates are approved and the permanent token is in place. Until then, leave it unset or `false` — the system safely logs to console instead of attempting real sends (no risk of a misconfigured send breaking anything).
7. **Business verification** (optional but recommended) raises your daily messaging limits — submit business documents via Meta Business Manager when ready for higher volume.

---

## Deployment Notes (Reference)

- Backend: Azure App Service — confirm **"Always On"** is enabled (Configuration → General Settings) if using the daily low-stock cron job, otherwise Azure may idle the app between requests and the scheduled check won't fire.
- Frontend: Azure Static Web Apps.
- Database: MongoDB Atlas — confirm automated backups are enabled on your plan tier.
- CORS: `CLIENT_ORIGIN` must exactly match the deployed frontend URL, not localhost, once live.
