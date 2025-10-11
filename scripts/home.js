// home.js
import { getAccessToken } from "./auth.js";

const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const resultsDiv = document.getElementById("search-results");
const profileSection = document.getElementById("profile");
const visualisation = document.getElementById("visualisation");

async function fetchUserProfile(token) {
	const res = await fetch("https://api.spotify.com/v1/me", {
		headers: { Authorization: `Bearer ${token}` },
	});
	const profile = await res.json();
	profileSection.innerHTML = `<h2>Welcome, ${profile.display_name}</h2>`;
}

async function searchTracks(token, query) {
	const res = await fetch(
		`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
		{
			headers: { Authorization: `Bearer ${token}` },
		}
	);

	if (!res.ok) {
		const errText = await res.text();
		console.error("Search failed:", res.status, errText);
		resultsDiv.innerHTML = `<p>Error searching tracks: ${res.status}</p>`;
		return;
	}

	const data = await res.json();
	displaySearchResults(data.tracks.items);
}

function displaySearchResults(tracks) {
	resultsDiv.innerHTML = "";

	if (!tracks.length) {
		resultsDiv.innerHTML = "<p>No results found.</p>";
		return;
	}

	tracks.forEach((track) => {
		const div = document.createElement("div");
		div.className = "track-result";
		
		const hasPreview = !!track.preview_url;
		
		div.innerHTML = `
			<img src="${track.album.images[0]?.url}" width="64" height="64" />
			<strong>${track.name}</strong><br/>
			<em>${track.artists.map((a) => a.name).join(", ")}</em><br/>
			${hasPreview ? "<button class='preview-btn'>▶ Preview</button>" : "<p><em>No preview available</em></p"}
		`;

		resultsDiv.appendChild(div);
		
		if (hasPreview) {
			const previewBtn = div.querySelector(".preview-btn");
			const audio = new Audio(track.preview_url);
			
			previewBtn.addEventListener("click", () => {
				if (!audio.paused) {
					audio.pause();
					previewBtn.textContent = "▶ Preview";
				} else {
					document.querySelectorAll("audio").forEach((a) => a.pause());
					audio.play();
					previewBtn. textContent = "▶ Pause";
					audio.onended = () => (previewBtn.textContent = "▶ Preview");
				}
			});
			
			div.appendChild(audio);
		}
		
		div.querySelector("img").addEventListener("click", () => showTrackFeatures(track.id));

		div.addEventListener("click", () => showTrackFeatures(track.id));
	});
}

async function showTrackFeatures(trackId) {
	const token = localStorage.getItem("access_token");
	const res = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const data = await res.json();

	visualisation.innerHTML = "<h3>Track Audio Features</h3>";
	const svg = d3.select("#visualisation").append("svg")
		.attr("width", 300)
		.attr("height", 200);

  // Simple bar chart of a few attributes
  const features = [
		{ name: "Danceability", value: data.danceability },
		{ name: "Energy", value: data.energy },
		{ name: "Valence", value: data.valence },
		{ name: "Speechiness", value: data.speechiness },
		{ name: "Acousticness", value: data.acousticness },
	];

	const xScale = d3.scaleBand()
		.domain(features.map(f => f.name))
		.range([20, 280])
		.padding(0.1);

	const yScale = d3.scaleLinear()
		.domain([0, 1])
		.range([180, 20]);

	svg.selectAll("rect")
		.data(features)
		.enter()
		.append("rect")
		.attr("x", d => xScale(d.name))
		.attr("y", d => yScale(d.value))
		.attr("width", xScale.bandwidth())
		.attr("height", d => 180 - yScale(d.value))
		.attr("fill", "steelblue");

	svg.selectAll("text.label")
		.data(features)
		.enter()
		.append("text")
		.attr("x", d => xScale(d.name) + xScale.bandwidth() / 2)
		.attr("y", d => yScale(d.value) - 5)
		.attr("text-anchor", "middle")
		.attr("font-size", "10px")
		.text(d => d.value.toFixed(2));
}

async function init() {
	const token = localStorage.getItem("access_token") || await getAccessToken();
	if (!token) {
		window.location.href = "index.html"; // redirect if not logged in
		return;
	}

	await fetchUserProfile(token);

	searchBtn.addEventListener("click", () => {
		const query = searchInput.value.trim();
		if (query) searchTracks(token, query);
	});
}

init();
