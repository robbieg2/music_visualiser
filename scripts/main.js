import { redirectToSpotifyAuth, getAccessToken } from "./auth.js";

const loginBtn = document.getElementById("login-btn");
const profileSection = document.getElementById("profile");
const visualisation = document.getElementById("visualisation");

async function fetchSpotifyData(token) {
  try {
    // Get user profile
    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`);
    const profile = await profileRes.json();
    profileSection.innerHTML = `<h2>Welcome, ${profile.display_name}</h2>`;

    // Get user top tracks
    const topTracksRes = await fetch("https://api.spotify.com/v1/me/top/tracks?limit=5", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!topTracksRes.ok) throw new Error(`Top tracks fetch failed: ${topTracksRes.status}`);
    const topTracks = await topTracksRes.json();

    if (!topTracks.items || topTracks.items.length === 0) {
      visualisation.innerHTML = "<p>No top tracks found. Try listening to more music on Spotify!</p>";
      return;
    }

    const trackIds = topTracks.items.map((t) => t.id);
    console.log("Track IDs:", trackIds);

    // Get audio features for top tracks
    const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features?ids=${trackIds.join(",")}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!featuresRes.ok) {
      const errText = await featuresRes.text();
      throw new Error(`Audio features fetch failed: ${featuresRes.status} - ${errText}`);
    }

    const features = await featuresRes.json();
    console.log("Audio features:", features);

    if (!features.audio_features) {
      visualisation.innerHTML = "<p>Could not load audio features for your tracks.</p>";
      return;
    }

    // Visualise (placeholder example)
    drawRadarChart(features.audio_features);
  } catch (error) {
    console.error("Error fetching Spotify data:", error);
    visualisation.innerHTML = `<p>Error fetching data: ${error.message}</p>`;
  }
}

function drawRadarChart(features) {
  visualisation.innerHTML = "<h3>Your Top Tracks’ Audio Features</h3>";
  const width = 300, height = 300;

  const svg = d3.select("#visualisation").append("svg")
    .attr("width", width)
    .attr("height", height);

  features.forEach((f, i) => {
    if (!f) return; // skip null values
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

