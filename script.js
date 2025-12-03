// Waterfall chart for GDP using merged(2).csv (semicolon DSV)
// Expects file in repo root named exactly: merged(2).csv

const margin = {top: 30, right: 140, bottom: 60, left: 110};
const width = 1000 - margin.left - margin.right;
const height = 520 - margin.top - margin.bottom;

const svg = d3.select("#chart")
  .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
  .attr("preserveAspectRatio","xMidYMid meet");

const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

// scales
const x = d3.scaleBand().padding(0.25).range([0, width]);
const y = d3.scaleLinear().range([height, 0]);
const colorUp = "#2ca02c";
const colorDown = "#d62728";
const colorBase = "#1f77b4";

// axes containers
const xG = g.append("g").attr("transform", `translate(0,${height})`);
const yG = g.append("g");

// tooltip
const tooltip = d3.select("body").append("div").attr("class","tooltip").style("display","none");

// legend area
const legendG = svg.append("g").attr("transform", `translate(${width + margin.left + 10}, ${margin.top})`);

// load file (semicolon-separated)
d3.text("merged(2).csv").then(raw => {
  const dsv = d3.dsvFormat(";");
  const data = dsv.parse(raw);

  // robust number parser (comma -> dot, remove spaces)
  function parseNum(s){
    if (s === undefined || s === null) return NaN;
    let v = String(s).trim();
    if (v === "" || v.toLowerCase() === "nan") return NaN;
    v = v.replace(/\s/g, '').replace(/,/g, '.');
    v = v.replace(/[^0-9eE+.\-]/g,''); // clean stray chars
    const n = parseFloat(v);
    return isFinite(n) ? n : NaN;
  }

  // detect keys
  const countryKey = Object.keys(data[0]).find(k => /country/i.test(k)) || "Country Name" || Object.keys(data[0])[1];
  const yearKey = Object.keys(data[0]).find(k => /year/i.test(k)) || "Year";
  const gdpKey = Object.keys(data[0]).find(k => /^GDP$/i.test(k)) || Object.keys(data[0]).find(k => /gdp/i.test(k));

  // clean rows
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
  select.selectAll("option")
    .data(countries)
    .join("option")
    .attr("value", d=>d)
    .text(d=>d);

  // default pick: first country
  if (countries.length) select.property("value", countries[0]);

  // function to build waterfall series for a country
  function buildWaterfall(country) {
    const arr = (grouped.get(country) || []).slice().sort((a,b)=>a.year-b.year);
    if (arr.length === 0) return [];

    const items = [];
    // first entry = starting base
    const start = {label: String(arr[0].year), year: arr[0].year, value: arr[0].GDP, type: "base"};
    items.push(start);

    // subsequent entries = delta (year-to-year)
    for (let i=1;i<arr.length;i++){
      const delta = arr[i].GDP - arr[i-1].GDP;
      items.push({label: String(arr[i].year), year: arr[i].year, value: delta, type: (delta >= 0 ? "increase" : "decrease")});
    }
    return items;
  }

  // draw function
  function draw(country){
    const items = buildWaterfall(country);
    if (items.length === 0) {
      svg.selectAll(".no-data").remove();
      svg.append("text").attr("class","no-data").attr("x", margin.left).attr("y", margin.top + 20).text("Keine Daten für dieses Land.");
      return;
    } else {
      svg.selectAll(".no-data").remove();
    }

    // compute cumulative starts and ends
    let cum = 0;
    const computed = items.map((it, i) => {
      if (i===0){
        const start = 0;
        const end = it.value;
        cum = end;
        return {...it, start, end, cumulative: cum};
      } else {
        const start = cum;
        const end = cum + it.value;
        cum = end;
        return {...it, start, end, cumulative: cum};
      }
    });

    // build x domain (use label order)
    x.domain(computed.map(d=>d.label));
    // y domain must include min(start,end) and max(start,end)
    const allYs = computed.flatMap(d => [d.start, d.end]);
    const yMin = Math.min(0, d3.min(allYs));
    const yMax = d3.max(allYs);
    y.domain([yMin * 1.05, yMax * 1.05]);

    // axes
    xG.call(d3.axisBottom(x)).selectAll("text").attr("transform","rotate(-40)").style("text-anchor","end");
    yG.call(d3.axisLeft(y).tickFormat(d3.format(".2s")));

    // draw bars (waterfall rectangles)
    const bars = g.selectAll(".bar").data(computed, d=>d.label);

    // exit
    bars.exit().transition().duration(300).style("opacity",0).remove();

    // enter
    const barsEnter = bars.enter().append("g").attr("class","bar");

    barsEnter.append("rect")
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

    // update (including transition)
    bars.select(".bar-rect")
      .transition().duration(600)
      .attr("x", d => x(d.label))
      .attr("width", x.bandwidth())
      .attr("y", d => y(Math.max(d.start, d.end)))
      .attr("height", d => Math.max(1, Math.abs(y(d.start) - y(d.end))))
      .attr("fill", d => d.type === "base" ? colorBase : (d.value >= 0 ? colorUp : colorDown));

    // numeric labels on bars (end value)
    const labels = g.selectAll(".bar-label").data(computed, d=>d.label);
    labels.exit().remove();
    labels.enter().append("text")
      .attr("class","bar-label")
      .attr("x", d => x(d.label) + x.bandwidth()/2)
      .attr("y", d => y(d.end) - 6)
      .attr("text-anchor","middle")
      .text(d => d3.format(",.0f")(d.end))
      .merge(labels)
      .transition().duration(600)
      .attr("x", d => x(d.label) + x.bandwidth()/2)
      .attr("y", d => y(d.end) - 6)
      .text(d => d3.format(",.0f")(d.end));

    // draw connector lines between bars (visual waterfall)
    const connectors = g.selectAll(".connector").data(computed.slice(1), d => d.label);
    connectors.exit().remove();
    const ce = connectors.enter().append("line").attr("class","connector")
      .attr("x1", (d,i) => x(computed[i].label) + x.bandwidth())
      .attr("x2", (d,i) => x(d.label))
      .attr("y1", (d,i) => y(computed[i].end))
      .attr("y2", (d,i) => y(d.start))
      .attr("stroke","#666")
      .attr("stroke-dasharray","3 2");

    connectors.merge(ce)
      .transition().duration(600)
      .attr("x1", (d,i) => x(computed[i].label) + x.bandwidth())
      .attr("x2", (d,i) => x(d.label))
      .attr("y1", (d,i) => y(computed[i].end))
      .attr("y2", (d,i) => y(d.start));

    // title / subtitle update
    svg.selectAll(".chart-title").remove();
    svg.append("text").attr("class","chart-title")
      .attr("x", margin.left).attr("y", 18)
      .attr("font-size","14px").attr("font-weight","700")
      .text(`${country} — GDP Waterfall (${computed[0].label} … ${computed[computed.length-1].label})`);

    // legend
    legendG.selectAll("*").remove();
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

  // selection handler
  select.on("change", () => {
    const c = select.node().value;
    draw(c);
  });

  // reset (no zoom implemented currently; placeholder)
  d3.select("#resetView").on("click", () => {
    draw(select.node().value);
  });

}).catch(err => {
  console.error("Fehler beim Laden/Parsen der CSV:", err);
  alert("Konnte merged(2).csv nicht laden. Prüfe Dateiname und Format (semikolon).");
});
