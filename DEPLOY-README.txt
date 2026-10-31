Destinie's Craft Store — how to put this build up so EVERYTHING works (including admin sign-in)

Deploy this WHOLE folder — not just the public/ folder — with a method that
builds Netlify Functions. Two ways that work:
  1. Netlify CLI, from inside THIS folder:  netlify deploy --build
  2. A Git-connected Netlify site using this folder as the repo.

Drag-and-drop does NOT work: it uploads only web pages and leaves the back
end behind, so admin sign-in fails with a 404. That 404 means "no back end
on this deploy", not "wrong password".

After the first deploy, set the ADMIN_PASSWORD environment variable in
Netlify (Site settings -> Environment variables), then deploy once more so
it takes effect. Then sign in at /admin.html with that password.

What is inside: the storefront (Event Mode: cart -> invoice -> pay in person
within 30 minutes), size options for every category, framed/unframed for
prints, the optional item-code box, and the admin + orders tools. Photos are
NOT bundled here on purpose — they live in the back end and are added
through admin upload.
