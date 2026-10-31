# Destinie's Craft Store order workflow setup

This package is a build for review, not a live deployment. Do not overwrite the live Netlify site until tested in a deploy preview.

## The event model (this replaces the old 12-hour / 24-hour Square workflow)
- Shoppers browse, add items to the cart, and confirm with their name.
- **In-person pickup = an invoice, issued immediately.** There is no owner
  review step at the event table. The invoice must be **paid in person
  within 30 minutes or it voids** — the shopper sees a live 30:00 countdown
  that flips the invoice to VOID at zero, and a scheduled function sweeps
  expired invoices every 15 minutes (so an invoice may stay listed up to
  ~15 minutes past its mark, but its stock reservation is released once
  it expires).
- **Shipping = a request.** The owner confirms the shipping cost and final
  total first. Shipping requests are never auto-expired.
- All sales are final — no refunds, no returns. Nothing is ever marked
  sold online; a sale counts when the shopper pays in person (pickup) or
  the owner confirms payment (shipping).
- After confirming, shoppers can tap a link that opens their messaging
  app addressed to Destinie's Google Voice number (203) 450-4438 with the
  full invoice already typed. They must press Send; this is not an
  automatic text. Automatic SMS alerts require an SMS provider account
  and private credentials, which are not included here.

## What is included
- Cart-based ordering with pickup or shipping selection.
- Shipping address collection, with shipping costs left for Destinie to confirm.
- Separate `/orders.html` Admin order inbox using the existing `ADMIN_PASSWORD`,
  with an order-details view showing item unit prices/line totals (including
  size and framed info), customer contact, fulfillment/address, subtotal/
  shipping/final total, invoice expiry, and status history.
- Order statuses: New (shipping review), Approved, Invoice sent, Paid,
  Ready, Completed, Cancelled, Expired.
- Separate Netlify Blobs order storage.
- Scheduled 30-minute expiration for unpaid event invoices only.
- Order status history timestamps and notes.
- Inventory deduction on Completed, with repeat-completion protection.
  Completion is blocked if the saved website inventory store is not
  initialized, to protect against overwriting live inventory with starter data.
- Sizes: every category has size options (dropdown per category plus a
  custom-size box), and Photo Prints have a Framed / Unframed choice.
  Sizes survive from Admin through the API to the product page, category
  pages, cart lines, and invoice lines.

## Before deployment
1. Make a backup of the current live site and confirm current inventory in Netlify Blobs/Admin.
2. Test this package in a separate Netlify deploy preview, including `/api/items`, `/api/orders`, `/orders.html`, pickup and shipping submissions, order status transitions, inventory deduction, and the 30-minute invoice void.
3. Ensure `ADMIN_PASSWORD` is set in Netlify environment variables (see ADMIN-SETUP.txt). Do not put passwords or provider tokens in public files.
4. Confirm the SMS destination number is correct before deployment.
5. Confirm scheduled Netlify Functions are available for the site plan and verify the scheduled `expire-orders` function runs.
6. Only publish to the live site after the tests pass and you approve it.

## Important limitations
- Payment is in person (pickup) or owner-confirmed (shipping). No online
  payment provider is connected in this build.
- Automatic SMS alerts to Destinie require an SMS provider account and private credentials; they are not included.
- Do not use the Admin inventory Save action to replace the inventory until it has been checked against the live inventory.
- Netlify Functions and Blobs behavior cannot be fully tested outside Netlify; the deploy-preview tests in step 2 above are required.
