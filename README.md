# Destinie Designs Virtual Boutique — Repair Build

This package preserves the original immersive storefront from the supplied craft-store project and adds direct category pages plus explicit Netlify API rewrites.

## Important safety notes
- This package has **not** been deployed.
- Deploying code to the existing Netlify site should not delete Netlify Blobs data, but do not reset or overwrite the shop store.
- The public storefront has built-in fallback products. The separate category pages use `/api/items` first and `public/items-seed.json` when no saved inventory is available.
- The included seed file contains 20 products. It may not match the newest live inventory saved in Netlify Blobs. Do not use an admin “save all” action until the live items have been confirmed.

## What's included
- `public/index.html`: original virtual boutique design, including the pegboard, shelf, rack, aisle, and product display markup, with a link to category pages and query-based category deep links.
- `public/categories/index.html`: category directory.
- `public/categories/*/index.html`: ten separate category pages.
- `public/`: code only — no product photos ship in the package. Photos are backend-only: they are uploaded through Admin (single-item form or bulk uploader) into Netlify Blobs backend storage and referenced by short `/api/img/...` URLs, so they survive redeploys. Items with no photos yet show a styled "Photo coming soon" tile, never a bundled or fake image.
- `public/admin.html`: existing admin interface.
- `netlify/functions/`: existing items, upload, and image functions.
- `netlify.toml`: static publish directory, function directory, and explicit `/api/*` rewrites.

## Deploying later
1. First verify the current live inventory and keep a backup. Do not delete or recreate the Netlify site.
2. Deploy this entire folder as a Netlify project using a build/deploy method that includes Netlify Functions (not a static-only drop upload).
3. Confirm `ADMIN_PASSWORD` is configured in Netlify environment variables.
4. Test `/api/items`, the homepage, a category page, product detail/cart flows, and the admin page before announcing the update.

## Local preview
Install Node.js LTS if needed, open this folder in VS Code, then run `npm.cmd install` in PowerShell. For Netlify Functions locally, install the Netlify CLI and run `npx netlify dev`. Do not deploy from the local terminal unless you intentionally choose to do so.


## Event invoice workflow (replaces the old 12-hour / 24-hour Square workflow)
- Shoppers add items to the cart and confirm with their name. **In-person pickup orders become an invoice immediately** — no owner review step at the table — and must be **paid in person within 30 minutes or the invoice voids** (a scheduled function sweeps expired invoices every 15 minutes; the shopper's countdown already shows VOID at exactly 30:00).
- Shipping orders still go through owner review: the owner confirms the shipping cost and final total first. Shipping requests are never auto-expired.
- Orders are saved through `/api/orders` in a separate Netlify Blobs store. The order page is available at `/orders.html` and uses the existing `ADMIN_PASSWORD`.
- Admin can move orders through review, approval, invoice sent, paid, ready, and completed. Mark Paid only after payment is received in person (pickup) or confirmed (shipping).
- The website inventory is deducted only when a paid/ready order is marked Completed. The endpoint records the deduction timestamp and blocks repeat completion, so the same order does not deduct twice. Expired or cancelled orders release their stock reservation.
- After confirming, customers can tap a link to open their messaging app addressed to Destinie's Google Voice number (203) 450-4438 with the full invoice already typed. They must press Send. This is **not an automatic SMS notification**. Automatic texts require an SMS provider and private credentials configured in Netlify.
- This build has not been deployed. Deploy it only after reviewing/testing it in a separate Netlify deploy preview. Never paste secrets into public files.

## Bulk image uploader (preview build)
- Admin now includes a bulk image uploader that accepts multiple JPG, PNG, and WebP photos.
- Images are grouped by matching product names (case-insensitive and whitespace-normalized). A trailing photo counter in parentheses is NOT part of the name: `Lavender`, `Lavender (1)`, `Lavender (2)` group as ONE product, in that order (plain file first, then (1), then (2)). Camera filenames such as `IMG_1042.jpg` need a product name entered in the uploader.
- Category suggestions currently use product-name keywords, with a category dropdown to correct the suggestion. This build does not connect to Gemini or another AI vision API, so it does not independently inspect image contents or call Gemini.
- Each new product group must contain exactly three images, have a name and category, and must not conflict with an existing product name. The first image is the default main image, and the main image can be changed in review.
- Each group also gets a size (a dropdown that changes with the category, plus "Other…" for a custom size) and, for Photo Prints, a Framed / Unframed choice. Sizes are saved with the item and shown on the product page, category pages, cart, and invoice. The single-item form has the same size and framed controls.
- New items in categories without a standing price (everything except Earrings $10, Bracelets $1, Fidget Spinners $5) start at $0 and cannot be saved until the owner sets a real price — prices are never invented.
- Approving the batch uploads images and adds new products to the current Admin session. The owner must then click the existing **Save changes** button to persist the product catalog. Existing products, prices, descriptions, and inventory are not overwritten by the bulk workflow.
- This is a preview code package only and has not been deployed. Test in a separate Netlify deploy preview before publishing.
