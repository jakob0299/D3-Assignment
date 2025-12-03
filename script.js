// script.js — Waterfall chart per country (D3 v7)

// layout
const margin = { top: 40, right: 160, bottom: 80, left: 80 };
const width = 1100 - margin.left - margin.right;
const height = 520 - margin.top - margin.bottom;

const svg = d3.select("#chart")
  .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

svg.selectAll("*").remove();
const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

// groups we'll reuse and clear
const chartG = g.append("g").attr("class", "chartG");
const xAxisG = g.append("g").attr("class", "x axis").attr("transform", `translate(0,${height})`);
const yAxisG = g.append("g").attr("class", "y axis");
const legendG = g.append("g").attr("class", "legendG").attr("transform", `translate(${width + 20},10)`);

// helpers
function parseNum(s) {
  if (s === undefined || s === null) return NaN;
  let v = String(s).trim();
  if (v === "" || v.toLowerCase() === "nan") return NaN;
  v = v.replace(/\s/g, "").replace(/,/g, ".");
  v = v.replace(/[^0-9eE+.\-]/g, "");
  const n = parseFloat(v);
  return isFinite(n) ? n : NaN;
}

// load file from root (merged(2).csv)
d3.text("merged(2).csv").then(raw => {
  const dsv = d3.dsvFormat(";");
  const rows = dsv.parse(raw);

  // find keys for Country and Year and GDP
  const keys = Object.keys(rows[0] || {});
  const countryKey = keys.find(k => /country/i.test(k)) || "Country Name" || keys[1];
  const yearKey = keys.find(k => /year/i.test(k)) || "Year";
  const gdpKey = keys.find(k => /^GDP($|[^a-z])/i.test(k)) || keys.find(k => /Gross domestic product|GDP/i) || "GDP";

  const cleaned = rows.map(r => ({
    country: r[countryKey] ? r[countryKey].trim() : "",
    year: parseInt((r[yearKey] || "").trim()) || NaN,
    gdp: parseNum(r[gdpKey])
  })).filter(d => d.country && !isNaN(d.year));

  // group by country
  const byCountry = d3.group(cleaned, d => d.country);
  const countries = Array.from(byCountry.keys()).sort((a,b) => a.localeCompare(b));

  // populate select
  const select = d3.select("#countrySelect");
  select.selectAll("option").data(countries).join("option")
    .attr("value", d => d)
    .text(d => d);

  // default: first country selected
  select.property("value", countries[0]);

  // axis scales (we will update domains on each draw)
  const xBand = d3.scaleBand().paddingInner(0.15).range([0, width]);
  const y = d3.scaleLinear().range([height, 0]);

  // axis format helper
  const fmt = d3.format(",.0f");
  const fmtShort = d3.format(".2s");

  function computeWaterfall(dataSorted) {
    // dataSorted: array of {year,gdp} sorted by year
    if (!dataSorted || dataSorted.length === 0) return [];
    const items = [];
    let cum = dataSorted[0].gdp || 0;
    // first item is the start baseline
    items.push({
      type: "start",
      year: dataSorted[0].year,
      value: dataSorted[0].gdp,
      start: 0,
      end: cum
    });
    for (let i = 1; i < dataSorted.length; i++) {
      const prev = dataSorted[i-1].gdp || 0;
      const cur = dataSorted[i].gdp || 0;
      const delta = cur - prev;
      const start = prev;
      const end = cur;
      items.push({
        type: delta >= 0 ? "increase" : "decrease",
        year: dataSorted[i].year,
        value: delta,
        start,
        end
      });
    }
    return items;
  }

  function drawForCountry(countryName) {
    // clear chart area (clean re-render)
    chartG.selectAll("*").remove();

    const rows = Array.from(byCountry.get(countryName) || []);
    if (rows.length === 0) {
      chartG.append("text").attr("x", 10).attr("y", 20).text("Keine Daten für dieses Land.");
      return;
    }
    const sorted = rows.sort((a,b) => a.year - b.year);

    // compute waterfall items
    const items = computeWaterfall(sorted);

    // x domain = list of years in items
    const years = items.map(d => d.year);
    xBand.domain(years);

    // compute y domain with a margin
    const values = items.flatMap(d => [d.start || 0, d.end || 0]);
    let yMin = d3.min(values.concat(0));
    let yMax = d3.max(values.concat(0));
    // if all values small, set a minimal range
    if (yMax === yMin) { yMax = yMax + 1; yMin = Math.min(0, yMin - 1); }
    y.domain([yMin - (Math.abs(yMin)*0.05), yMax + (Math.abs(yMax)*0.05)]).nice();

    // axes
    const xTicksEvery = Math.ceil(years.length / 12); // keep tick count reasonable
    const xTickValues = years.filter((d,i) => (i % xTicksEvery) === 0);

    xAxisG.call(d3.axisBottom(xBand).tickValues(xTickValues).tickFormat(d3.format("d")))
      .selectAll("text")
      .attr("transform", "rotate(-40)").style("text-anchor", "end").attr("dx", "-0.4em").attr("dy", "0.3em");

    yAxisG.call(d3.axisLeft(y).tickFormat(d => {
      // human-friendly: use G/T if large
      return fmtShort(d);
    }));

    // title
    chartG.append("text")
      .attr("x", 0)
      .attr("y", -18)
      .attr("class", "chart-title")
      .text(`${countryName} — GDP Waterfall (${years[0]} … ${years[years.length - 1]})`)
      .style("font-weight","700");

    // bars group
    const barG = chartG.append("g").attr("class","bars");

    // draw bars using data join (ensures update/exit handled correctly)
    const bw = Math.max(6, xBand.bandwidth());
    const bars = barG.selectAll("g.bar").data(items, d => d.year);

    const barsEnter = bars.enter().append("g").attr("class","bar")
      .attr("transform", d => `translate(${xBand(d.year)},0)`);

    // rect
    barsEnter.append("rect")
      .attr("class","bar-rect")
      .attr("x", 0)
      .attr("width", bw)
      .attr("y", d => y(Math.max(d.start, d.end)))
      .attr("height", d => Math.max(1, Math.abs(y(d.start) - y(d.end))))
      .attr("fill", d => d.type === "start" ? "#4682b4" : (d.type === "increase" ? "#2e8b57" : "#b22222"))
      .attr("stroke", "#333")
      .attr("stroke-width", 0.6);

    // add labels above bars
    barsEnter.append("text")
      .attr("class","bar-label")
      .attr("x", bw / 2)
      .attr("y", d => y(Math.max(d.start, d.end)) - 6)
      .attr("text-anchor","middle")
      .style("font-size","12px")
      .text(d => {
        if (d.type === "start") return fmt(d.value || 0);
        return (d.value >= 0 ? "+" : "") + fmt(d.value);
      });

    // small line marker to baseline for start item (optional)
    barsEnter.filter(d => d.type === "start").append("line")
      .attr("x1", bw + 2).attr("x2", bw + 2)
      .attr("y1", d => y(d.start)).attr("y2", d => y(d.end))
      .attr("stroke", "#4682b4").attr("stroke-width", 2);

    // tooltip interaction (simple)
    barsEnter.on("mouseenter", (event, d) => {
      const tt = d3.select("body").selectAll(".tt").data([d]);
      const ttEnter = tt.enter().append("div").attr("class","tt tooltip").style("position","absolute");
      ttEnter.merge(tt)
        .html(() => {
          if (d.type === "start") return `<strong>${d.year}</strong><br>Start: ${fmt(d.value || 0)}`;
          return `<strong>${d.year}</strong><br>Δ: ${ (d.value >= 0 ? "+" : "") + fmt(d.value) }<br>Prev: ${fmt(d.start)}<br>Now: ${fmt(d.end)}`;
        })
        .style("left", (event.pageX + 14) + "px")
        .style("top", (event.pageY - 10) + "px")
        .style("display","block");
    }).on("mouseleave", () => {
      d3.selectAll(".tt").remove();
    });

    // legend (clear then add)
    legendG.selectAll("*").remove();
    const legendData = [
      { label: "Startwert", color: "#4682b4" },
      { label: "Zunahme (Δ > 0)", color: "#2e8b57" },
      { label: "Abnahme (Δ < 0)", color: "#b22222" }
    ];
    const legendItem = legendG.selectAll(".legendItem").data(legendData).enter().append("g")
      .attr("class","legendItem").attr("transform", (d,i) => `translate(0, ${i*24})`);
    legendItem.append("rect").attr("width", 14).attr("height", 14).attr("fill", d => d.color).attr("stroke","#333");
    legendItem.append("text").attr("x", 20).attr("y", 12).text(d => d.label).style("font-size","13px");

    // final visual tweak: reduce label overlap if many years — optional (skip some)
    // handled by tick selection above
  }

  // initial draw
  drawForCountry(select.property("value"));

  // events
  d3.select("#countrySelect").on("change", function() {
    const country = this.value;
    drawForCountry(country);
  });

  d3.select("#resetView").on("click", () => {
    // re-draw currently selected country — this also clears previous DOM clutter
    drawForCountry(d3.select("#countrySelect").node().value);
  });

}).catch(err => {
  console.error("Fehler beim Laden/Parsen der CSV:", err);
  d3.select("#chart").append("text").text("Fehler beim Laden der Daten. Prüfe merged(2).csv");
});
