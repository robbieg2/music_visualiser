// features.js

// ReccoBeats configuration
const RECCOBEATS_BASE = "https://api.reccobeats.com/v1"
// Cache audio features by Spotify track ID
const audioFeatureCache = new Map();

const trackInfo = document.getElementById("track-info");
const logoutBtn = document.getElementById("logout-btn");
const backBtn = document.getElementById("back-btn");

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
  
  if (!Array.isArray(list) || list.length === 0 || !list[0]) {
    throw new Error("No audio features returned for this track id.");
  }

  const features = list[0];
  audioFeatureCache.set(spotifyTrackId, features);
  return features;
}

/* async function getTrackFeaturesFromReccoBeatsByReccoId(reccoTrackId) {
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
} */

// Initial chart using ReccoBeats features
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

function renderTrackHeader(track) {
	const artists = (track.artists || []).join(", ");
	
	trackInfo.innerHTML = `
		${track.image ? `<img src="${track.image}" width="160" height="160" style="border-radius:12px;">` : ""}
		<h1 style="margin-top:15px;">${track.name}</h1>
		<p style="opacity:0.8;">${artists}</p>
		
		<div style="margin-top:20px; display:flex; justify-content:center;">
			<iframe
				src="https://open.spotify.com/embed/track/${track.id}"
				width="360"
				height="80"
				frameborder="0"
				allowtransparency="true"
				allow="encrypted-media">
			</iframe>
		</div>
	`;
}

async function init() {
	backBtn.addEventListener("click", () => window.location.href = "home.html");
	
	logoutBtn.addEventListener("click", () => {
		localStorage.removeItem("access_token");
		window.location.href = "index.html";
	});
	
	const params = new URLSearchParams(window.location.search);
	const trackParam = params.get("track");
	
	if(!trackParam) {
		trackInfo.innerHTML = "<p>No track provided</p>";
		return;
	}
	
	let track;
	try {
		track = JSON.parse(decodeURIComponent(trackParam));
	} catch {
		trackInfo.innerHTML = "<p>Invalid track data</p>";
		return;
	}
	
	renderTrackHeader(track);
	
	const vis = document.getElementById("visualisation");
	vis.innerHTML = "<p style='text-align:center;'>Loading audio features</p>";
	
	try {
		const features = await getTrackFeaturesFromReccoBeats(track.id);
		drawAudioFeaturesChart(track, features);
	} catch (err) {
		console.error(err);
		vis.innerHTML = `<p style="text-align:center;">Could not load audio features: ${err.message}</p>`;
	}
}

init();
	