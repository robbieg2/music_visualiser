import { redirectToSpotifyAuth, getAccessToken } from "./auth.js";

const loginBtn = document.getElementById("login-btn");

if (loginBtn) {
	loginBtn.addEventListener("click", redirectToSpotifyAuth);
}

