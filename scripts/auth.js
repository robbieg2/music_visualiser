// --- Spotify API Configuration ---
const clientId = "de2b80fd8ec441fab7a41253c8a2ba35";
const redirectUri = "https://robbieg2.github.io/music_visualiser/";

// --- Scopes required for this project ---
const scopes = [
  "user-top-read",
  "user-read-private",
  "user-read-email"
].join(" ");

// --- Utility: Generate random strings and PKCE challenge ---
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(x => chars[x % chars.length])
    .join("");
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- Step 1: Redirect user to Spotify login page ---
export async function redirectToSpotifyAuth() {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  localStorage.setItem("code_verifier", codeVerifier);

  const state = generateRandomString(16);
  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.append("client_id", clientId);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("scope", scopes);
  authUrl.searchParams.append("state", state);
  authUrl.searchParams.append("code_challenge_method", "S256");
  authUrl.searchParams.append("code_challenge", codeChallenge);

  console.log("Redirecting to Spotify login...");
  window.location = authUrl.toString();
}

// --- Step 2: Exchange authorization code for an access token ---
export async function getAccessToken() {
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) {
    console.warn("No authorization code found in URL.");
    return null;
  }

  const codeVerifier = localStorage.getItem("code_verifier");
  if (!codeVerifier) {
    console.error("No code verifier found in localStorage. Restarting login flow.");
    redirectToSpotifyAuth();
    return null;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  console.log("Requesting Spotify access token...");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await response.json();
  console.log("Spotify token response:", data);

  if (!response.ok) {
    console.error("❌ Token request failed:", data);
    throw new Error(`Token error: ${data.error_description || data.error}`);
  }

  if (!data.access_token) {
    console.error("❌ No access token received from Spotify.");
    throw new Error("Access token missing in response.");
  }

  localStorage.setItem("access_token", data.access_token);
  console.log("✅ Access token saved successfully.");
  return data.access_token;
}

