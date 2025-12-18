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

// Initial chart using ReccoBeats features
function drawAudioFeaturesChart(track, features) {
	const container = document.getElementById("visualisation");
	container.innerHTML = `
		<h2>Audio Features</h2>
		<p><em>${track.name} - ${track.artists.join(", ")}</em></p>
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
	];
	
	if (!data.length) {
		container.innerHTML += `<p>No usable feature values returned for this track</p>`;
		return;
	}
	
	const width = 420;
	const height = 420;
	const radius = Math.min(width, height) / 2 - 50;
	const levels = 5;
	const angleSlice = (Math.PI * 2) / data.length;
	
	const svg = d3.select("#visualisation")
		.append("svg")
		.attr("width", width)
		.attr("height", height)
		.append("g")
		.attr("transform", `translate(${width / 2}, ${height / 2})`);
		
	const rScale = d3.scaleLinear()
		.domain([0, 1])
		.range([0, radius]);
		
	for (let level = 1; level <= levels; level++) {
		svg.append("circle")
			.attr("r", (radius / levels) * level)
			.style("fill", "none")
			.style("stroke", "#444");
	}
	
	data.forEach((d, i) => {
		const angle = angleSlice * i - Math.PI / 2;
		const x = rScale(1.05) * Math.cos(angle);
		const y = rScale(1.05) * Math.sin(angle);
		
		svg.append("line")
			.attr("x1", 0).attr("y1", 0)
			.attr("x2", x).attr("y2", y)
			.style("stroke", "#555");
			
		svg.append("text")
			.attr("x", x)
			.attr("y", y)
			.style("fill", "#fff")
			.style("font-size", "12px")
			.style("text-anchor", "middle")
			.text(d.name);
	});
	
	const radarLine = d3.lineRadial()
		.radius(d => rScale(d.value))
		.angle((d, i) => i * angleSlice)
		.curve(d3.curveLinearClosed);
		
	svg.append("path")
		.datum(data)
		.attr("d", radarLine)
		.style("fill", "#1db954")
		.style("fill-opacity", 0.4)
		.style("stroke", "#1db954")
		.style("stroke-width", 2);
		
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
	