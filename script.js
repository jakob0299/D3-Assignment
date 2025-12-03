// D3 interactive multi-line time-series (GDP). Drop into js/script.js
// Expects data/gdp.csv (semicolon-separated) — adapt path if needed.

// Layout
const margin = {top: 20, right: 110, bottom: 110, left: 70};
const width = 1000 - margin.left - margin.right;
const height = 480 - margin.top - margin.bottom;

// Create responsive svg
const svg = d3.select("#chart")
  .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
  .attr("preserveAspectRatio","xMidYMid meet");

const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

// Scales
let x = d3.scaleLinear().range([0, width]);
let y = d3.scaleLinear().range([height, 0]);
const color = d3.scaleOrdinal(d3.schemeTableau10);

// Axes groups
const xAxisG = g.append("g").attr("transform", `translate(0,${height})`);
const yAxisG = g.append("g");

// Clipping (so zoomed lines don't overflow)
g.append("clipPath").attr("id","clip")
  .append("rect").attr("width", width).attr("height", height);

// Lines container
const linesG = g.append("g").attr("clip-path","url(#clip)");

// Tooltip
const tooltip = d3.select("body").append("div").attr("class","tooltip").style("display","none");

// Brush container (we'll use brush to zoom by narrowing x domain)
const brushG = svg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top + height + 10})`);

// Load & parse data
d3.text("data/gdp.csv").then(rawText => {
  // parse semicolon DSV (handles header)
  const dsv = d3.dsvFormat(";");
  const data = dsv.parse(rawText);

  // The header in your sample had an empty first column; normalize keys
  // find the column that contains "Country" name
  // We'll create a cleaned row object per row and parse numbers robustly.
  const cleaned = data.map(row => {
    // helper to find the key for "Country Name" or "Country" etc.
    const countryKey = Object.keys(row).find(k => /country/i.test(k)) || "Country Name";
    const yearKey = Object.keys(row).find(k => /year/i.test(k)) || "Year";

    function parseNum(s){
      if (s === undefined || s === null) return NaN;
      let v = String(s).trim();
      if (v === "" || v.toLowerCase() === "nan") return NaN;
      // remove spaces, replace comma decimal with dot, remove thousands spaces
      v = v.replace(/\s/g,'').replace(/,/g,'.');
      // sometimes there are stray semicolons or plus signs - remove non-numeric trailing chars
      v = v.replace(/[^0-9eE+.\-]/g,'');
      const n = parseFloat(v);
      return isFinite(n) ? n : NaN;
    }

    return {
      country: row[countryKey],
      year: +row[yearKey],
      GDP: parseNum(row["GDP"] ?? row[" Gross domestic product (current US$) "] ?? row["GDP (current)"] ?? row["GDP"]),
      GDP_growth: parseNum(row["GDP growth"] ?? row["GDP growth"] ?? row["GDP growth"] ),
      population: parseNum(row["Population - Sex: all - Age: all - Variant: estimates"] ?? row["Population"]),
      code: row["Code"] || row["Country Code"] || null,
      continent: row["continent"] || row["Continent"] || null,
      raw: row
    };
  });

  // Remove rows w/o year or country
  const filtered = cleaned.filter(d => d.country && !isNaN(d.year));

  // Group per country and sort by year
  const seriesByCountry = d3.group(filtered, d => d.country);
  const countries = Array.from(seriesByCountry.keys()).sort((a,b)=>a.localeCompare(b));

  // prepare series array
  const series = [];
  for (const [country, rows] of seriesByCountry) {
    const sorted = rows.sort((a,b)=>a.year - b.year);
    series.push({country, values: sorted});
  }

  // populate select
  const select = d3.select("#countrySelect");
  select.selectAll("option")
    .data(countries)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  // default selection: first country + few large ones if available
  const defaultPick = [countries[0]];
  // pre-select top few if list contains "United States" etc
  if(countries.includes("United States")) defaultPick.push("United States");
  select.selectAll("option").property("selected", d => defaultPick.includes(d));

  // set domains
  const allYears = filtered.map(d=>d.year);
  x.domain(d3.extent(allYears));
  y.domain([0, d3.max(filtered, d => d.GDP) || 1]);

  // draw axes
  const xAxis = d3.axisBottom(x).tickFormat(d3.format("d"));
  const yAxis = d3.axisLeft(y).tickFormat(d => {
    if (d >= 1e12) return d3.format(".2s")(d);
    if (d >= 1e9) return d3.format(".2s")(d);
    return d3.format(".2s")(d);
  });

  xAxisG.call(xAxis);
  yAxisG.call(yAxis);

  // axis labels
  xAxisG.append("text")
    .attr("class","axis-label")
    .attr("x", width/2)
    .attr("y", 46)
    .attr("fill","#666")
    .attr("text-anchor","middle")
    .text("Year");

  yAxisG.append("text")
    .attr("transform","rotate(-90)")
    .attr("x",-height/2)
    .attr("y",-50)
    .attr("fill","#666")
    .attr("text-anchor","middle")
    .text("GDP (current US$)");

  // line generator
  const line = d3.line()
    .defined(d => !isNaN(d.GDP))
    .x(d => x(d.year))
    .y(d => y(d.GDP));

  // function to draw selected countries
  function update(selectedCountries, transitionDuration = 800) {
    // filter series
    const selectedSeries = series.filter(s => selectedCountries.includes(s.country));

    color.domain(selectedCountries);

    // update y domain to max of selection (nice)
    const ymax = d3.max(selectedSeries, s => d3.max(s.values, v => v.GDP)) || d3.max(filtered, d => d.GDP) || 1;
    y.domain([0, ymax * 1.05]);

    // update axes
    yAxisG.transition().duration(transitionDuration).call(d3.axisLeft(y).tickFormat(d => d3.format(".2s")(d)));
    xAxisG.transition().duration(transitionDuration).call(d3.axisBottom(x).tickFormat(d3.format("d")));

    // data join for lines
    const seriesSel = linesG.selectAll(".country-line")
      .data(selectedSeries, d => d.country);

    // EXIT
    seriesSel.exit()
      .transition().duration(400)
      .style("opacity",0)
      .remove();

    // ENTER
    const seriesEnter = seriesSel.enter().append("g").attr("class","country-line");

    seriesEnter.append("path")
      .attr("class","line")
      .attr("fill","none")
      .attr("stroke-width",2.4)
      .attr("stroke-linejoin","round")
      .attr("stroke-linecap","round")
      .attr("d", d => line(d.values))
      .attr("stroke", d => color(d.country))
      .each(function(d){
        // animated drawing using stroke-dasharray
        const path = this;
        const total = path.getTotalLength();
        d3.select(path)
          .attr("stroke-dasharray", `${total} ${total}`)
          .attr("stroke-dashoffset", total)
          .transition().duration(1000).attr("stroke-dashoffset", 0);
      });

    // add hover circles (invisible until hover)
    seriesEnter.append("g").attr("class","points")
      .selectAll("circle")
      .data(d => d.values.filter(v => !isNaN(v.GDP)))
      .join("circle")
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(d.GDP))
      .attr("r", 3)
      .attr("fill", d => color(d.country))
      .attr("opacity", 0)
      .on("mouseover", (e,d) => {
        tooltip.style("display","block")
          .html(`<strong>${d.country}</strong><br/>Year: ${d.year}<br/>GDP: ${d3.format(",.0f")(d.GDP)}<br/>Population: ${isNaN(d.population) ? "n/a" : d3.format(",")(d.population)}`);
      })
      .on("mousemove", (e) => {
        tooltip.style("left", (e.pageX + 12) + "px").style("top", (e.pageY - 12) + "px");
      })
      .on("mouseout", () => tooltip.style("display","none"));

    // UPDATE existing lines (transition)
    seriesSel.select(".line")
      .transition().duration(transitionDuration)
      .attr("d", d => line(d.values))
      .attr("stroke", d => color(d.country));

    seriesSel.selectAll(".points circle")
      .data(d => d.values.filter(v => !isNaN(v.GDP)))
      .join("circle")
      .transition().duration(transitionDuration)
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(d.GDP))
      .attr("r", 3)
      .attr("fill", d => color(d.country))
      .attr("opacity", 0);

    // Add legend to the right
    const legend = g.selectAll(".legend").data(selectedSeries, d=>d.country);
    legend.exit().remove();
    const legendEnter = legend.enter().append("g").attr("class","legend");
    legendEnter.append("rect").attr("width",12).attr("height",12).attr("x", width + 18).attr("y", (d,i) => 6 + i*20).attr("fill", d => color(d.country));
    legendEnter.append("text").attr("x", width + 36).attr("y", (d,i) => 16 + i*20).text(d => d.country).attr("font-size","12px");

    // update positions
    g.selectAll(".legend rect").attr("fill", d => color(d.country));
    g.selectAll(".legend text").text(d => d.country);
  }

  // selection change handler
  function readSelectionAndUpdate() {
    const selected = Array.from(select.node().selectedOptions, opt => opt.value).slice(0,6); // limit to 6
    if (selected.length === 0) {
      // if none selected, pick first
      update([countries[0]]);
    } else {
      update(selected);
    }
  }

  // initial draw
  readSelectionAndUpdate();

  // events
  select.on("change", () => {
    readSelectionAndUpdate();
    // Reset x domain to full extent when changing countries
    x.domain(d3.extent(allYears));
    d3.select("#resetZoom").property("disabled", false);
  });

  // Brush (x-range brush) — small horizontal brush bar below chart
  const brushHeight = 40;
  const brushSvg = brushG.append("g");
  const brushX = d3.scaleLinear().domain(x.domain()).range([0, width]);

  // empty axis under brush for years
  const brushAxis = brushG.append("g").attr("transform", `translate(0,${brushHeight - 18})`)
    .call(d3.axisBottom(brushX).tickFormat(d3.format("d")));

  // brush rect area
  const brushBehavior = d3.brushX()
    .extent([[0,0],[width,brushHeight]])
    .on("end", ({selection}) => {
      if (!selection) return;
      const [x0, x1] = selection;
      const year0 = Math.round(brushX.invert(x0));
      const year1 = Math.round(brushX.invert(x1));
      // clamp
      x.domain([Math.max(d3.min(allYears), year0), Math.min(d3.max(allYears), year1)]);
      // update main chart
      readSelectionAndUpdate();
      d3.select("#resetZoom").attr("disabled", null);
    });

  brushG.append("rect").attr("width", width).attr("height", brushHeight).attr("fill","transparent");
  brushG.append("g").attr("class","brush").call(brushBehavior);

  // Reset zoom
  d3.select("#resetZoom").on("click", () => {
    x.domain(d3.extent(allYears));
    // clear brush selection visually
    brushG.select(".brush").call(brushBehavior.move, null);
    readSelectionAndUpdate();
    d3.select("#resetZoom").attr("disabled", true);
  }).attr("disabled", true);

  // Hover behavior: show nearest point for all lines at mouse x
  svg.on("mousemove", function(event) {
    const [mx] = d3.pointer(event, g);
    const yearAtMouse = Math.round(x.invert(mx - 0)); // approximate year
    // find points at that year for visible series
    const selected = Array.from(select.node().selectedOptions, opt => opt.value).slice(0,6);
    if (selected.length === 0) return;
    const visibleSeries = series.filter(s => selected.includes(s.country));
    // show tooltip summary at cursor
    const nearestPoints = visibleSeries.map(s => {
      const v = s.values.find(d => d.year === yearAtMouse);
      return v ? {country: s.country, v} : null;
    }).filter(Boolean);
    if (nearestPoints.length === 0) {
      tooltip.style("display","none");
      return;
    }
    const html = nearestPoints.map(p => `<strong>${p.country}</strong>: ${isNaN(p.v.GDP) ? "n/a" : d3.format(",.0f")(p.v.GDP)}`).join("<br/>");
    tooltip.style("display","block").html(`<div>Year: ${yearAtMouse}</div><div style="margin-top:6px">${html}</div>`);
    const [px, py] = d3.pointer(event);
    tooltip.style("left", (px + 18) + "px").style("top", (py - 18) + "px");
  }).on("mouseleave", ()=>tooltip.style("display","none"));

  // window resize handler to keep brush domain in sync
  window.addEventListener("resize", () => {
    brushX.domain(x.domain());
    brushAxis.call(d3.axisBottom(brushX).tickFormat(d3.format("d")));
  });

}).catch(err => {
  console.error("Failed to load or parse data/gdp.csv:", err);
  alert("Could not load data/gdp.csv. Make sure the file exists and is semicolon-delimited.");
});
