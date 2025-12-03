// Waterfall chart for GDP using merged(2).csv (semicolon DSV)
// Improved: filters out NaN GDP rows, uses first valid GDP as base,
// reduces x-axis ticks to avoid overcrowding, avoids NaN in labels.

const margin = {top: 30, right: 160, bottom: 80, left: 110};
const width = 1000 - margin.left - margin.right;
const height = 520 - margin.top - margin.bottom;

const svg = d3.select("#chart")
  .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
  .attr("preserveAspectRatio","xMidYMid meet");

svg.selectAll("*").remove();
const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

// scales
const x = d3.scaleBand().padding(0.25).range([0, width]);
const y = d3.scaleLinear().range([height, 0]);
const colorUp = "#2ca02c";
const colorDown = "#d62728";
const colorBase = "#1f77b4";

const xG = g.append("g").attr("transform", `translate(0,${height})`);
const yG = g.append("g");

const tooltip = d3.select("body").append("div").attr("class","tooltip").style("display","none");
const legendG = svg.append("g").attr("transform", `translate(${width + margin.left + 10}, ${margin.top})`);

// robust number parser (comma -> dot, keep exponent notation)
function parseNum(s){
  if (s === undefined || s === null) return NaN;
  let v = String(s).trim();
  if (v === "" || v.toLowerCase() === "nan") return NaN;
  v = v.replace(/\s/g, '').replace(/,/g, '.');
  v = v.replace(/[^0-9eE+.\-]/g,''); // keep E for exponents
  const n = parseFloat(v);
  return isFinite(n) ? n : NaN;
}

// load file (semicolon-separated)
d3.text("merged(2).csv").then(raw => {
  const dsv = d3.dsvFormat(";");
  const data = dsv.parse(raw);

  if (!data || data.length === 0) {
    alert("CSV leer oder Fehler beim Parsen.");
    return;
  }

  // detect keys heuristically
  const countryKey = Object.keys(data[0]).find(k => /country/i.test(k)) || Object.keys(data[0])[1];
  const yearKey = Object.keys(data[0]).find(k => /year/i.test(k)) || Object.keys(data[0]).find(k => /yr|year/i.test(k));
  const gdpKey = Object.keys(data[0]).find(k => /^GDP$/i.test(k)) || Object.keys(data[0]).find(k => /gdp/i.test(k));

  // map rows, parse numbers
  const rows = data.map(r => ({
    country: r[countryKey],
    year: +r[yearKey],
    GDP: parseNum(r[gdpKey]),
    raw: r
  })).filter(r => r.country && !isNaN(r.year));

  // group by country
  const grouped = d3.group(rows, d => d.country);
  const countries = Array.from(grouped.keys()).sort((a,b)=>a.localeCompare(b));

  // populate select
  const select = d3.select("#countrySelect");
  select.selectAll("option").remove();
  select.selectAll("option")
    .data(countries)
    .join("option")
    .attr("value", d=>d)
    .text(d=>d);

  if (countries.length > 0) select.property("value", countries[0]);

  // Build waterfall items but skip years with NaN GDP.
  function buildWaterfall(country) {
    const arr = (grouped.get(country) || []).slice().sort((a,b)=>a.year-b.year);
    // filter to entries with valid GDP
    const valid = arr.filter(d => !isNaN(d.GDP));
    if (valid.length === 0) return [];

    const items = [];
    // first valid entry is base
    const first = valid[0];
    items.push({label: String(first.year), year: first.year, value: first.GDP, type: "base"});

    for (let i=1;i<valid.length;i++){
      const prev = valid[i-1];
      const cur = valid[i];
      const delta = cur.GDP - prev.GDP;
      items.push({label: String(cur.year), year: cur.year, value: delta, type: (delta >= 0 ? "increase" : "decrease")});
    }
    return items;
  }

  function draw(country) {
    const items = buildWaterfall(country);
    // clear previous chart area content (keeps responsive viewBox)
    g.selectAll(".bar").remove();
    g.selectAll(".bar-label").remove();
    g.selectAll(".connector").remove();
    svg.selectAll(".chart-title").remove();
    legendG.selectAll("*").remove();

    if (items.length === 0) {
      svg.append("text").attr("class","chart-title").attr("x", margin.left).attr("y", 18)
        .attr("font-size","14px").attr("font-weight","700")
        .text(`${country} — keine GDP-Daten (gültige Einträge fehlen)`);
      return;
    }

    // compute cumulative start/end, ensure numeric
    let cum = 0;
    const computed = items.map((it, i) => {
      if (i===0){
        const start = 0;
        const end = Number.isFinite(it.value) ? it.value : 0;
        cum = end;
        return {...it, start, end, cumulative: cum};
      } else {
        const start = cum;
        const end = cum + (Number.isFinite(it.value) ? it.value : 0);
        cum = end;
        return {...it, start, end, cumulative: cum};
      }
    });

    // x domain & y domain
    x.domain(computed.map(d=>d.label));
    const allYs = computed.flatMap(d => [d.start, d.end]);
    const yMin = Math.min(0, d3.min(allYs));
    const yMax = d3.max(allYs);
    // handle degenerate range
    const pad = (yMax - yMin) === 0 ? Math.abs(yMax)*0.1 + 1 : (yMax - yMin)*0.05;
    y.domain([yMin - pad, yMax + pad]);

    // axis ticks: show only every 5th year or adaptive
    const years = computed.map(d=>+d.label);
    let tickValues;
    if (years.length <= 10) tickValues = years;
    else {
      const step = Math.ceil(years.length / 10);
      tickValues = years.filter((d,i) => i % step === 0);
    }

    xG.call(d3.axisBottom(x).tickValues(computed.map(d=>d.label))).selectAll("text")
      .attr("transform","rotate(-40)").style("text-anchor","end").style("font-size","11px");
    // additionally reduce number of visible year labels by controlling which get shown
    xG.selectAll(".tick text").style("display", function(d,i){
      // show only ticks whose index is multiple of step
      const idx = computed.findIndex(c=>c.label === d);
      if (computed.length <= 12) return "block";
      const step = Math.ceil(computed.length / 12);
      return (idx % step === 0) ? "block" : "none";
    });

    yG.call(d3.axisLeft(y).tickFormat(d3.format(".2s")));

    // bars
    const bars = g.selectAll(".bar").data(computed, d=>d.label);
    const be = bars.enter().append("g").attr("class","bar");

    be.append("rect")
      .attr("class","bar-rect")
      .attr("x", d => x(d.label))
      .attr("width", x.bandwidth())
      .attr("y", d => y(Math.max(d.start, d.end)))
      .attr("height", d => Math.max(1, Math.abs(y(d.start) - y(d.end))))
      .attr("fill", d => d.type === "base" ? colorBase : (d.value >= 0 ? colorUp : colorDown))
      .attr("stroke", "#333")
      .on("mouseover", (event,d) => {
        tooltip.style("display","block")
          .html(`<strong>${country}</strong><br/>Jahr: ${d.label}<br/>Wert: ${d.type === "base" ? d3.format(",.0f")(d.value) + " (Start)" : (d.value>=0?"+":"") + d3.format(",.0f")(d.value)}<br/>Kumulativ: ${d3.format(",.0f")(d.cumulative)}`);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY - 12) + "px");
      })
      .on("mouseout", () => tooltip.style("display","none"));

    // labels with guarding against NaN
    be.append("text")
      .attr("class","bar-label")
      .attr("x", d => x(d.label) + x.bandwidth()/2)
      .attr("y", d => y(d.end) - 6)
      .attr("text-anchor","middle")
      .style("font-size","11px")
      .text(d => Number.isFinite(d.end) ? d3.format(",.0f")(d.end) : "");

    // connectors
    const connectors = be.append("line").attr("class","connector")
      .attr("x1", (d,i) => i===0 ? 0 : x(computed[i-1].label) + x.bandwidth())
      .attr("x2", (d,i) => x(d.label))
      .attr("y1", (d,i) => i===0 ? y(0) : y(computed[i-1].end))
      .attr("y2", (d,i) => y(d.start))
      .attr("stroke","#666")
      .attr("stroke-dasharray","3 2");

    // title
    svg.append("text").attr("class","chart-title")
      .attr("x", margin.left).attr("y", 18)
      .attr("font-size","14px").attr("font-weight","700")
      .text(`${country} — GDP Waterfall (${computed[0].label} → ${computed[computed.length-1].label})`);

    // legend
    const legendData = [
      {label: "Startwert", color: colorBase},
      {label: "Zunahme (Δ > 0)", color: colorUp},
      {label: "Abnahme (Δ < 0)", color: colorDown}
    ];
    const lg = legendG.selectAll(".lg").data(legendData).enter().append("g").attr("class","lg")
      .attr("transform", (d,i) => `translate(0,${i*24})`);
    lg.append("rect").attr("width",14).attr("height",14).attr("fill", d => d.color).attr("stroke","#333");
    lg.append("text").attr("x",20).attr("y",11).text(d => d.label).attr("font-size","12px");
  }

  // initial draw
  draw(select.property("value"));

  // change handler
  select.on("change", () => {
    draw(select.node().value);
  });

  d3.select("#resetView").on("click", () => {
    draw(select.node().value);
  });

}).catch(err => {
  console.error("Fehler beim Laden/Parsen der CSV:", err);
  alert("Konnte merged(2).csv nicht laden. Prüfe Dateiname und Format (semikolon).");
});
