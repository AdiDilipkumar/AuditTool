// ─── APP CONFIGURATION ────────────────────────────────────────────────────────
// IT: fill in the three values below to connect the app to your infrastructure.
// No other files need to change.

export const config = {
  // Azure AD app registration (from IT / Entra ID)
  AZURE_CLIENT_ID:  'YOUR_CLIENT_ID_HERE',
  AZURE_TENANT_ID:  'YOUR_TENANT_ID_HERE',

  // Base URL for the backend REST API (from IT)
  // e.g. 'https://auditapi.ninetyone.com' — no trailing slash
  API_BASE_URL: 'YOUR_API_BASE_URL_HERE',
};
