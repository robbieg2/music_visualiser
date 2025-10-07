import { redirectToSpotifyAuth, getAccessToken } from "./auth.js";

const loginBtn = document.getElementById("login-btn");
const profileSection = document.getElementById("profile");
const visualisation = document.getElementById("visualisation");

async function fetchSpotifyData(token) {
  // Get user profile
  const profileRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const profile = await profileRes.json();
  profileSection.innerHTML = `<h2>Welcome, ${profile.display_name}</h2>`;

  // Get user top tracks
  const topTracksRes = await fetch("https://api.spotify.com/v1/me/top/tracks?limit=5", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const topTracks = await topTracksRes.json();

  const trackIds = topTracks.items.map((t) => t.id).join(",");
  const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features?ids=${trackIds}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const features = await featuresRes.json();

  // Visualise (example: Radar Chart with D3)
  drawRadarChart(features.audio_features);
}

function drawRadarChart(features) {
  visualisation.innerHTML = "<h3>Your Top Tracks’ Audio Features</h3>";
  const width = 300, height = 300;
  const svg = d3.select("#visualisation").append("svg")
    .attr("width", width)
    .attr("height", height);

  // Example: draw circles for simplicity (replace with radar chart later)
  features.forEach((f, i) => {
    svg.append("circle")
      .attr("cx", 50 + i * 40)
      .attr("cy", height / 2)
      .attr("r", f.energy * 30)
      .style("fill", "steelblue")
      .style("opacity", 0.6);
  });
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (code) {
    const token = await getAccessToken();
    if (token) await fetchSpotifyData(token);
  }

  loginBtn.addEventListener("click", redirectToSpotifyAuth);
}

init();
