// features-charts.js

export function drawMultiRadarChart(series) {
    const container = document.getElementById("visualisation");
	
    container.innerHTML = `<h2>Audio Features</h2>`;
    d3.select("#visualisation").selectAll("svg").remove();

    const axes = [
        { key: "Danceability", label: "Danceability" },
        { key: "Energy", label: "Energy" },
        { key: "Valence", label: "Valence" },
        { key: "Speechiness", label: "Speechiness" },
        { key: "Acousticness", label: "Acousticness" },
        { key: "Instrumentalness", label: "Instrumental" },
    ];

	const normalized = series
		.map(s => {
			const points = axes.map(a => ({
				axis: a.label,
				key: a.key,
				value: Number(s.fearures?.[a.key])
			})).map(p => ({
				...p,
				value: Number.isFinite(p.value) ? Math.max(0, Math.min(1, p.value)) : 0
			}));
			
			return { ...s, points };
		})
		.filter(s => s.points.length === axes.length);
	
    if (!normalized.length) {
        container.innerHTML += `<p>No usable feature values returned for this track</p>`;
        return;
    }

    const width = 460;
    const height = 460;
    const radius = Math.min(width, height) / 2 - 70;
    const levels = 5;
    const angleSlice = (Math.PI * 2) / axes.length;

    const svg = d3.select("#visualisation")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const rScale = d3.scaleLinear().domain([0, 1]).range([0, radius]);

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
            .attr("x1", 0)
            .attr("y1", 0)
            .attr("x2", rScale(1) * Math.cos(angle))
            .attr("y2", rScale(1) * Math.sin(angle))
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
        .radius((d) => rScale(d.value))
        .angle((d, i) => i * angleSlice)
        .curve(d3.curveLinearClosed);
		
	const palette = ["#ffffff", "#1db954", "#3ea6ff", "#ff7a00", "#b26bff", "#ff4d6d"];
	
	normalized.forEach((s, idx) => {
		const stroke = s.isSeed ? palette[0] : palette[(idx % (palette.length - 1)) + 1];
		const fill = s.isSeed ? palette[0] : stroke;

		svg.append("path")
			.datum(s.points)
			.attr("d", radarLine)
			.style("fill", fill)
			.style("fill-opacity", s.isSeed ? 0.10 : 0.12)
			.style("stroke", stroke)
			.style("stroke-width", s.isSeed ? 3 : 2)
			.style("opacity", 0.95);
	});
	
	const legend = d3.select("#visualisation")
		.append("div")
        .style("display", "flex")
        .style("gap", "12px")
        .style("flex-wrap", "wrap")
        .style("justify-content", "center")
        .style("margin-top", "10px");
		
	normalized.forEach((s, idx) => {
		const color = s.isSeed ? palette[0] : palette[(idx % (palette.length - 1)) + 1];
		
		const item = legend.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "8px")
            .style("font-size", "12px")
            .style("opacity", "0.9");

        item.append("span")
            .style("display", "inline-block")
            .style("width", "10px")
            .style("height", "10px")
            .style("border-radius", "50%")
            .style("background", color);

        item.append("span")
            .text(s.label.length > 34 ? s.label.slice(0, 34) + "…" : s.label);
    });
}

export function drawSimilarityBarChart(rows) {
    const container = document.getElementById("sim-bar");
    if (!container) return;
    container.innerHTML = "";

    const width = Math.min(560, container.clientWidth || 560);
    const height = 360;
    const margin = { top: 20, right: 20, bottom: 40, left: 220 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, 1]).range([0, innerW]);
    const y = d3
        .scaleBand()
        .domain(rows.map((r) => r.id))
        .range([0, innerH])
        .padding(0.15);

    g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(5))
        .selectAll("text")
        .style("fill", "#fff");

    g.append("g")
        .call(
            d3.axisLeft(y).tickFormat((id) => {
                const r = rows.find((x) => x.id === id);
                const name = r?.track?.name || id;
                const artists = (r?.track?.artists || []).join(", ");
                const label = `${name} — ${artists}`;
                return label.length > 40 ? label.slice(0, 40) + "…" : label;
            })
        )
        .selectAll("text")
        .style("fill", "#fff");

    g.selectAll("rect")
        .data(rows)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", (d) => y(d.id))
        .attr("width", (d) => x(d.score))
        .attr("height", y.bandwidth())
        .attr("fill", "#1db954")
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            const trackParam = encodeURIComponent(JSON.stringify(d.track));
            window.location.href = `features.html?track=${trackParam}`;
        });

    g.selectAll(".score-label")
        .data(rows)
        .enter()
        .append("text")
        .attr("x", (d) => x(d.score) + 6)
        .attr("y", (d) => y(d.id) + y.bandwidth() / 2 + 4)
        .attr("fill", "#fff")
        .attr("font-size", "12px")
        .text((d) => d.score.toFixed(2));
}

export function drawSimilarityScatter(seedFeatures, rows) {
    const container = document.getElementById("sim-scatter");
    if (!container) return;

    const xSel = document.getElementById("x-feature");
    const ySel = document.getElementById("y-feature");

    const width = Math.min(560, container.clientWidth || 560);
    const height = 420;
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };

    function getVal(f, key) {
        const v = Number(f?.[key]);
        return Number.isFinite(v) ? v : null;
    }

    function render() {
        container.innerHTML = "";

        const xKey = xSel?.value || "energy";
        const yKey = ySel?.value || "valence";

        const points = rows
            .map((r) => ({
                ...r,
                x: getVal(r.features, xKey),
                y: getVal(r.features, yKey),
            }))
            .filter((p) => p.x != null && p.y != null);

        const seedX = getVal(seedFeatures, xKey);
        const seedY = getVal(seedFeatures, yKey);

        const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);

        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        const xDomain = d3.extent(points.map((p) => p.x));
        const yDomain = d3.extent(points.map((p) => p.y));

        if (seedX != null) {
            xDomain[0] = Math.min(xDomain[0], seedX);
            xDomain[1] = Math.max(xDomain[1], seedX);
        }
        if (seedY != null) {
            yDomain[0] = Math.min(yDomain[0], seedY);
            yDomain[1] = Math.max(yDomain[1], seedY);
        }

        const pad = (min, max) => {
            const span = max - min || 1;
            return [min - span * 0.05, max + span * 0.05];
        };

        const x = d3.scaleLinear().domain(pad(xDomain[0], xDomain[1])).range([0, innerW]);
        const y = d3.scaleLinear().domain(pad(yDomain[0], yDomain[1])).range([innerH, 0]);

        g.append("g")
            .attr("transform", `translate(0,${innerH})`)
            .call(d3.axisBottom(x).ticks(6))
            .selectAll("text")
            .style("fill", "#fff");

        g.append("g").call(d3.axisLeft(y).ticks(6)).selectAll("text").style("fill", "#fff");

        g.append("text")
            .attr("x", innerW / 2)
            .attr("y", innerH + 40)
            .attr("text-anchor", "middle")
            .attr("fill", "#fff")
            .text(xKey);

        g.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -innerH / 2)
            .attr("y", -45)
            .attr("text-anchor", "middle")
            .attr("fill", "#fff")
            .text(yKey);

        g.selectAll("circle.rec")
            .data(points)
            .enter()
            .append("circle")
            .attr("class", "rec")
            .attr("cx", (d) => x(d.x))
            .attr("cy", (d) => y(d.y))
            .attr("r", (d) => 6 + d.score * 6)
            .attr("fill", "#1db954")
            .style("opacity", 0.75)
            .style("cursor", "pointer")
            .on("click", (event, d) => {
                const trackParam = encodeURIComponent(JSON.stringify(d.track));
                window.location.href = `features.html?track=${trackParam}`;
            });

        if (seedX != null && seedY != null) {
            g.append("circle").attr("cx", x(seedX)).attr("cy", y(seedY)).attr("r", 10).attr("fill", "#fff").style("opacity", 0.9);
            g.append("text").attr("x", x(seedX) + 12).attr("y", y(seedY) + 4).attr("fill", "#fff").attr("font-size", "12px").text("Seed");
        }
    }

    render();
    if (xSel) xSel.addEventListener("change", render);
    if (ySel) ySel.addEventListener("change", render);
}
