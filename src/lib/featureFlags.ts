// Build-time flags for integrations not ready to expose in production yet -
// read from Vite env vars (see DEPLOY.md), same convention as
// VITE_SUPER_ADMIN_EMAILS (src/lib/superAdmin.ts). These only ever gate
// which UI entry points render; the underlying Yahoo/Stripe backend code
// and routes stay fully functional everywhere (including prod) so a
// deploy can still reach them directly if needed.
//
// Both default to enabled (true) when unset, so local dev and the
// "develop" Vercel environment (pointing at the dev Convex deployment)
// need nothing set - only prod sets these to "false". See DEPLOY.md for
// the exact Vercel env var to set per environment.
function isEnabled(value: string | undefined): boolean {
  return value !== "false";
}

export const YAHOO_IMPORT_ENABLED = isEnabled(
  import.meta.env.VITE_ENABLE_YAHOO_IMPORT,
);

export const BILLING_LINK_ENABLED = isEnabled(
  import.meta.env.VITE_ENABLE_BILLING_LINK,
);
