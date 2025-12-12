// home.js
import { getAccessToken } from "./auth.js";

const profileSection = document.getElementById("profile");
const artistsList = document.getElementById("artists-list");
const tracksList = document.getElementById("tracks-list");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const resultsDiv = document.getElementById("search-results");
const logoutBtn = document.getElementById("logout-btn");
const scrollLeftBtn = document.getElementById("scroll-left");
const scrollRightBtn = document.getElementById("scroll-right");

// ReccoBeats configuration
const RECCOBEATS_BASE = "https://api.reccobeats.com/v1"
// Cache audio features by Spotify track ID
const audioFeatureCache = new Map();

async function getTrackFeaturesFromReccoBeats(spotifyTrackId) {
  if (audioFeatureCache.has(spotifyTrackId)) return audioFeatureCache.get(spotifyTrackId);

  const url = `${RECCOBEATS_BASE}/audio-features?ids=${encodeURIComponent(spotifyTrackId)}`;
  const res = await fetch(url);

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new Error(`Rate limited (429). Retry after: ${retryAfter || "unknown"}s`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ReccoBeats audio-features failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  const list = data.content;
  
  if (!Array.isArray(list) || list.length === 0 || list[0]) {
    throw new Error("No audio features returned for this track id.");
  }

  const features = list[0];
  audioFeatureCache.set(spotifyTrackId, features);
  return features;
}

async function getTrackFeaturesFromReccoBeatsByReccoId(reccoTrackId) {
  if (audioFeatureCache.has(reccoTrackId)) return audioFeatureCache.get(reccoTrackId);

  const url = `${RECCOBEATS_BASE}/track/${encodeURIComponent(reccoTrackId)}/audio-features`;
  const res = await fetch(url);

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new Error(`Rate limited (429). Retry after: ${retryAfter || "unknown"}s`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ReccoBeats audio-features failed: ${res.status} ${text}`);
  }

  const feat = await res.json();
  audioFeatureCache.set(reccoTrackId, feat);
  return feat;
}

async function fetchSpotifyData(token) {
	try {
		// Profile
		const profileRes = await fetch("https://api.spotify.com/v1/me", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const profile = await profileRes.json();
		profileSection.innerHTML = `
			<h2>Welcome, ${profile.display_name}</h2>
			${profile.images?.[0]?.url ? `<img src="${profile.images[0].url}" width="100" style="border-radius:50%;">` : ""}
		`;

		// Top artists
		const artistsRes = await fetch("https://api.spotify.com/v1/me/top/artists?limit=5", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const artists = await artistsRes.json();
		artistsList.innerHTML = "";
		if (artists.items) {
			artists.items.forEach((a) => {
				artistsList.innerHTML += `
					<div style="text-align:center;">
						<img src="${a.images?.[0]?.url || ""}" alt="${a.name}" width="120" height="120" style="border-radius:50%;">
						<p>${a.name}</p>
					</div>
				`;
			});
		}

		// Top tracks
		const tracksRes = await fetch("https://api.spotify.com/v1/me/top/tracks?limit=5", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const tracks = await tracksRes.json();
		tracksList.innerHTML = "";
		if (tracks.items) {
			tracks.items.forEach((t) => {
				tracksList.innerHTML += `
					<div style="text-align:center;">
						<img src="${t.album.images?.[0]?.url || ""}" alt="${t.name}" width="120" height="120">
						<p>${t.name}</p>
						<p style="color:gray;">${t.artists.map((a) => a.name).join(", ")}</p>
					</div>
				`;
			});
		}
	} catch (err) {
		console.error("Error fetching Spotify data:", err);
		profileSection.innerHTML = `<p>Error loading your data. Please try logging in again.</p>`;
	}
}
// Search bar
async function searchTracks(token, query) {
	try {
		const res = await fetch(
			`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=7`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);
		if (!res.ok) throw new Error("Search failed");
		const data = await res.json();
		displaySearchResults(data.tracks.items);
	} catch (err) {
		console.error("Error searching tracks:", err);
		resultsDiv.innerHTML = `<p>Error searching for tracks.</p>`;
	}
}

function displaySearchResults(tracks) {
	resultsDiv.innerHTML = "";
	
	if (!tracks || !tracks.length) {
		resultsDiv.innerHTML = "<p>No results found.</p>";
		return;
	}

	tracks.forEach((track) => {
		const div = document.createElement("div");
		div.className = "track-result";

		div.innerHTML = `
			<img src="${track.album.images[0]?.url}" width="120" height="120" style="border-radius:10px;"><br/>
			<strong>${track.name}</strong><br/>
			<em>${track.artists.map((a) => a.name).join(", ")}</em><br><br/>
			<iframe src="https://open.spotify.com/embed/track/${track.id}"
					width="300" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media">
			</iframe>
			<br/><br/>
			<button class="features-btn">Show audio features</button>
		`;

		resultsDiv.appendChild(div);
		
		const featuresBtn = div.querySelector(".features-btn");
		if (featuresBtn) {
			featuresBtn.addEventListener("click", () => showTrackFeatures(track));
		}
	});
	
	updateScrollButtons();
}

// Initial chart using ReccoBeats features
async function showTrackFeatures(track) {
	const container = document.getElementById("visualisation");
	container.innerHTML = `
		<h2>Audio Features for: ${track.name}<h2>
		<p>Loading features...</p>
	`;
	
	try {
		const features = await getTrackFeaturesFromReccoBeats(track.id);		
		drawAudioFeaturesChart(track, features);
	} catch (err) {
		console.error("Error fetching audio features:", err);
		container.innerHTML = `
			<h2>Audio Features for: ${track.name}<h2>
			<p>Could not load audio features. ${err.message}</p>
		`;
	}
}

function drawAudioFeaturesChart(track, features) {
	const container = document.getElementById("visualisation");
	container.innerHTML = `
		<h2>Audio Features for: ${track.name}</h2>
		<p><em>${track.artists.map(a => a.name).join(", ")}</em></p>
	`;
	
	// Remove old charts
	d3.select("#visualisation").selectAll("svg").remove();
	
	const data = [
		{ name: "Danceability", value: Number(features.danceability) },
		{ name: "Energy", value: Number(features.energy) },
		{ name: "Valence", value: Number(features.valence) },
		{ name: "Speechiness", value: Number(features.speechiness) },
		{ name: "Acousticness", value: Number(features.acousticness) },
		{ name: "Instrumental", value: Number(features.instrumentalness) },
	].filter(d => Number.isFinite(d.value));
	
	if (!data.length) {
		container.innerHTML += `<p>No usable feature values returned for this track</p>`;
		return;
	}
	
	const margin = { top: 30, right: 20, bottom: 60, left: 50 };
	const width = 600 - margin.left - margin.right;
	const height = 350 - margin.top - margin.bottom;
	
	const svg = d3.select("#visualisation")
		.append("svg")
		.attr("width", width + margin.left + margin.right)
		.attr("height", height + margin.top + margin.bottom)
		.append("g")
		.attr("transform", `translate(${margin.left},${margin.top})`);
		
	
	const x = d3.scaleBand()
		.domain(data.map(d => d.name))
		.range([0, width])
		.padding(0.2);
		
	const y = d3.scaleLinear()
		.domain([0, 1])
		.range([height, 0]);
		
	svg.append("g")
		.attr("transform", `translate(0, ${height})`)
		.call(d3.axisBottom(x))
		.selectAll("text")
		.attr("transform", "rotate(-30)")
		.style("text-anchor", "end")
		.style("fill", "#fff");
		
	svg.append("g")
		.call(d3.axisLeft(y).ticks(5))
		.selectAll("text")
		.style("fill", "#fff");
		
	svg.selectAll(".bar")
		.data(data)
		.enter()
		.append("rect")
		.attr("class", "bar")
		.attr("x", d => x(d.name))
		.attr("y", d => y(d.value))
		.attr("width", x.bandwidth())
		.attr("height", d => height - y(d.value))
		.attr("fill", "#1db954");
		
	svg.selectAll(".label")
		.data(data)
		.enter()
		.append("text")
		.attr("x", d => x(d.name) + x.bandwidth() / 2)
		.attr("y", d => y(d.value) - 5)
		.attr("text-anchor", "middle")
		.attr("fill", "#fff")
		.attr("font-size", "11px")
		.text(d => d.value.toFixed(2));
		
	if (features.tempo != null) {
		container.innerHTML += `<p>Tempo: <strong>${Number(features.tempo).toFixed(1)} BPM</strong></p>`;
	}
}

function scrollCarouselBy(offset) {
	resultsDiv.scrollBy({ left: offset, behavior: "smooth" });
}

function updateScrollButtons() {
	if (!scrollLeftBtn || !scrollRightBtn) return;
	const maxScrollLeft = resultsDiv.scrollWidth - resultsDiv.clientWidth;
	
	scrollLeftBtn.style.display = resultsDiv.scrollLeft <= 0 ? "none" : "block";
	scrollRightBtn.style.display = resultsDiv.clientWidth >= resultsDiv.scrollWidth - 1 ? "none" : "block";
}

async function init() {
	let token = localStorage.getItem("access_token");

	if (!token) {
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get("code")) {
			token = await getAccessToken();
		}
		if (!token) {
			window.location.href = "index.html";
			return;
		}
	}

	await fetchSpotifyData(token);

	// Search button
	searchBtn.addEventListener("click", () => {
		const query = searchInput.value.trim();
		if (query) searchTracks(token, query);
	});
	
	searchInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			const query = searchInput.value.trim();
			if (query) searchTracks(token, query);
		}
	});

	// Logout
	logoutBtn.addEventListener("click", () => {
		localStorage.removeItem("access_token");
		window.location.href = "index.html";
	});
	
	// Carousel scroll buttons
	if (scrollLeftBtn && scrollRightBtn) {
		scrollLeftBtn.addEventListener("click", () => scrollCarouselBy(-320));
		scrollRightBtn.addEventListener("click", () => scrollCarouselBy(320));
		
		resultsDiv.addEventListener("scroll", updateScrollButtons);
		window.addEventListener("resize", updateScrollButtons);
		updateScrollButtons();
	}
}

init();

