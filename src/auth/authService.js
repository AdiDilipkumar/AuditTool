// ─── AUTH SERVICE ─────────────────────────────────────────────────────────────
// MSAL (Microsoft Authentication Library) integration for Azure AD SSO.
//
// STATUS: Skeleton ready for IT to activate.
// IT steps:
//   1. Register the app in Entra ID (Azure AD)
//   2. Set AZURE_CLIENT_ID and AZURE_TENANT_ID in src/config.js
//   3. Uncomment the MSAL block below and remove the stub block
//   4. npm install @azure/msal-browser

import { config } from '../config';

// ── STUB (active until IT provision credentials) ──────────────────────────────
// Returns a hardcoded user so the app is navigable without a live auth flow.
// Swap out for the MSAL block below once config.js is populated.

const STUB_USER = {
  id:        'u-adi',
  full_name: 'Adi Dilipkumar',
  email:     'adi.dilipkumar@ninetyone.com',
  role:      'HIA',
};

export async function initAuth()       { return; }
export async function login()          { return; }
export async function logout()         { return; }
export async function getCurrentUser() { return STUB_USER; }
export async function getAccessToken() { return null; }
export function isAuthenticated()      { return true; }

// ── MSAL BLOCK (uncomment when IT are ready) ──────────────────────────────────
//
// import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
//
// const msalConfig = {
//   auth: {
//     clientId:    config.AZURE_CLIENT_ID,
//     authority:   `https://login.microsoftonline.com/${config.AZURE_TENANT_ID}`,
//     redirectUri: window.location.origin,
//   },
//   cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
// };
//
// const loginRequest = { scopes: ['openid', 'profile', 'User.Read'] };
// let msalInstance = null;
//
// export async function initAuth() {
//   msalInstance = new PublicClientApplication(msalConfig);
//   await msalInstance.initialize();
//   const response = await msalInstance.handleRedirectPromise();
//   if (response) msalInstance.setActiveAccount(response.account);
//   else {
//     const accounts = msalInstance.getAllAccounts();
//     if (accounts.length > 0) msalInstance.setActiveAccount(accounts[0]);
//   }
// }
//
// export async function login() {
//   await msalInstance.loginRedirect(loginRequest);
// }
//
// export async function logout() {
//   await msalInstance.logoutRedirect();
// }
//
// export function isAuthenticated() {
//   return !!msalInstance?.getActiveAccount();
// }
//
// export async function getCurrentUser() {
//   const account = msalInstance?.getActiveAccount();
//   if (!account) return null;
//   return {
//     id:        account.localAccountId,
//     full_name: account.name,
//     email:     account.username,
//     role:      null, // resolved from your users table by email after login
//   };
// }
//
// export async function getAccessToken() {
//   try {
//     const result = await msalInstance.acquireTokenSilent({
//       ...loginRequest,
//       account: msalInstance.getActiveAccount(),
//     });
//     return result.accessToken;
//   } catch (err) {
//     if (err instanceof InteractionRequiredAuthError) {
//       await msalInstance.acquireTokenRedirect(loginRequest);
//     }
//     throw err;
//   }
// }
