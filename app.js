"use strict";

// ---------- tiny DOM helpers (all data text goes through textContent) ----------
function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "style") Object.assign(node.style, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
const SVG = "http://www.w3.org/2000/svg";
function s(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  return node;
}
const pct = (x, digits = 0) => (x == null ? "–" : `${(x * 100).toFixed(digits)}%`);
const fmt = (n) => Number(n).toLocaleString("en-US");
const hours = (x) => (x == null ? "–" : `${x.toFixed(1)} hours`);
const num2 = (x) => (x == null ? "–" : x.toFixed(2));

// ---------- tooltip ----------
const tip = document.getElementById("tooltip");
function showTip(evt, ...lines) {
  tip.replaceChildren(...lines);
  tip.hidden = false;
  const pad = 14;
  const { innerWidth: W, innerHeight: H } = window;
  const r = tip.getBoundingClientRect();
  let x = (evt.clientX ?? 0) + pad, y = (evt.clientY ?? 0) + pad;
  if (evt.type === "focus" || evt.clientX == null) {
    const b = evt.target.getBoundingClientRect();
    x = b.right + pad; y = b.top;
  }
  if (x + r.width > W - 8) x = Math.max(8, x - r.width - pad * 2);
  if (y + r.height > H - 8) y = Math.max(8, y - r.height - pad * 2);
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
function hideTip() { tip.hidden = true; }
function hoverable(node, linesFn) {
  const show = (e) => showTip(e, ...linesFn());
  node.addEventListener("pointermove", show);
  node.addEventListener("focus", show);
  node.addEventListener("pointerleave", hideTip);
  node.addEventListener("blur", hideTip);
  return node;
}

// ---------- data ----------
let D;
const byKey = new Map();
let FAMILY_SLOTS = [];   // top families by collection share, fixed order -> fixed colors
function familyColor(f) {
  if (f === "Unknown") return "var(--unknown)";
  const i = FAMILY_SLOTS.indexOf(f);
  return i >= 0 ? `var(--s${i + 1})` : "var(--other)";
}
function familyBucket(f) {
  if (f === "Unknown") return "Unknown";
  return FAMILY_SLOTS.includes(f) ? f : "Other genres";
}
function bucketShares(shares) {
  const out = new Map();
  for (const { family, share } of shares) {
    const b = familyBucket(family);
    out.set(b, (out.get(b) || 0) + share);
  }
  return out;
}
const BUCKET_ORDER = () => [...FAMILY_SLOTS, "Other genres", "Unknown"];
const bucketColor = (b) => (b === "Other genres" ? "var(--other)" : familyColor(b));

function trackArtists(t) {
  return t.artists.map((id) => D.artists[id]).filter(Boolean);
}
function artistLinks(t) {
  const list = t.artists.filter((id) => D.artists[id]);
  const out = [];
  list.forEach((id, i) => {
    if (i) out.push(", ");
    out.push(h("a", { href: `#/artist/${id}` }, D.artists[id].name));
  });
  return out;
}
function playlistTitle(p) { return p.name; }
function statusBadge(p) {
  if (!p.reachable) return h("span", { class: "badge" }, "No longer on Spotify");
  if (p.changes && p.changes.renamed_to) return h("span", { class: "badge" }, `Now called “${p.changes.renamed_to}”`);
  return null;
}

// ---------- charts ----------
function barList(items, { max, unknownLabel } = {}) {
  const top = max ?? Math.max(...items.map((d) => d.value));
  const grid = h("div", { class: "bars" });
  for (const d of items) {
    const lab = d.href ? h("a", { class: "lab", href: d.href }, d.label) : h("span", { class: "lab" }, d.label);
    const fill = h("div", {
      class: `fill${d.label === unknownLabel ? " unknown" : ""}`,
      style: { width: `${(100 * d.value) / top}%` },
    });
    const track = hoverable(h("div", { class: "track", tabindex: "0", "aria-label": `${d.label}: ${d.display}` }, fill),
      () => [h("b", {}, d.display), h("span", { class: "k" }, d.tip || d.label)]);
    grid.append(lab, track, h("span", { class: "val" }, d.display));
  }
  return grid;
}

function decadeColumns(decades) {
  const top = Math.max(...decades.map((d) => d.share));
  const cols = h("div", { class: "cols", role: "img", "aria-label": "Share of songs by decade" });
  const labels = h("div", { class: "col-labels" });
  for (const d of decades) {
    const bar = h("div", { class: "bar", style: { height: `${(85 * d.share) / top}%` } });
    cols.append(hoverable(h("div", { class: "col", tabindex: "0" }, h("span", { class: "cap" }, pct(d.share)), bar),
      () => [h("b", {}, pct(d.share, 1)), h("span", { class: "k" }, `of songs with a known year are from the ${d.decade}s`)]));
    labels.append(h("span", {}, `${String(d.decade).slice(2)}s`));
  }
  return h("div", {}, cols, labels);
}

function heatmap() {
  const fams = D.overview.family_mix.map((f) => f.family).filter((f) => f !== "Unknown");
  fams.push("Unknown");
  const share = new Map(D.overview.heatmap.map((c) => [`${c.playlist_key}|${c.family}`, c.share]));
  const max = Math.max(...D.overview.heatmap.filter((c) => c.family !== "Unknown").map((c) => c.share));
  const grid = h("div", { class: "heat", style: { gridTemplateColumns: `minmax(64px, 110px) repeat(${fams.length}, minmax(14px, 1fr))` } });
  grid.append(h("span", {}));
  for (const f of fams) grid.append(h("span", { class: "hdr" }, f));
  for (const p of D.playlists) {
    grid.append(h("a", { class: "row-lab", href: `#/p/${p.key}` }, playlistTitle(p)));
    for (const f of fams) {
      const v = share.get(`${p.key}|${f}`) || 0;
      // square-root scale: most shares are small, and a linear ramp hides the differences
      const mix = Math.round(100 * Math.sqrt(Math.min(1, v / max)));
      const cell = h("a", {
        class: "cell", href: `#/p/${p.key}`, "aria-label": `${p.name}, ${f}: ${pct(v)}`,
        style: { background: f === "Unknown"
          ? `color-mix(in oklab, var(--muted) ${mix}%, var(--surface))`
          : `color-mix(in oklab, var(--seq) ${mix}%, var(--surface))` },
      });
      grid.append(hoverable(cell, () => [h("b", {}, pct(v)), h("span", { class: "k" }, `of “${p.name}” is ${f === "Unknown" ? "untagged" : f}`)]));
    }
  }
  return grid;
}

function energyChart(arc, p) {
  const box = h("div", { class: "chart" });
  const draw = () => {
    const W = Math.max(300, box.clientWidth || 600), H = 240;
    const m = { l: 34, r: 10, t: 10, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = arc.length;
    const x = (i) => m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = (v) => m.t + ih - v * ih;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img",
      "aria-label": `Energy of each song in order, ${n} songs with energy data` });
    for (const v of [0, 0.5, 1]) {
      svg.append(s("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: v === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
      const t = s("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" });
      t.textContent = v === 0 ? "0" : v === 1 ? "1" : "0.5";
      svg.append(t);
    }
    const first = s("text", { x: m.l, y: H - 8 }); first.textContent = "First song";
    const last = s("text", { x: W - m.r, y: H - 8, "text-anchor": "end" }); last.textContent = "Last song";
    svg.append(first, last);
    for (let i = 0; i < n; i++) {
      svg.append(s("circle", { cx: x(i), cy: y(arc[i].energy), r: 2.5, fill: "var(--line)", opacity: 0.45 }));
    }
    const d = arc.map((pt, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pt.smooth_energy).toFixed(1)}`).join("");
    svg.append(s("path", { d, fill: "none", stroke: "var(--line)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const cross = s("line", { y1: m.t, y2: m.t + ih, stroke: "var(--ink-2)", "stroke-width": 1, visibility: "hidden" });
    const dot = s("circle", { r: 5, fill: "var(--line)", stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" });
    const hit = s("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", tabindex: 0 });
    svg.append(cross, dot, hit);
    let focusIdx = 0;
    const show = (i, evt) => {
      const pt = arc[i];
      const t = D.tracks[p.tracks.find((r) => r.position === pt.pos)?.track_id];
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(pt.energy)); dot.setAttribute("visibility", "visible");
      showTip(evt,
        h("b", {}, `Energy ${num2(pt.energy)}`),
        h("div", {}, `Song ${pt.pos + 1}: ${t ? t.name : "?"}`),
        h("div", { class: "k" }, t ? trackArtists(t).map((a) => a.name).join(", ") : ""),
        h("div", { class: "k" }, `Mood ${num2(pt.valence)} · ${pt.tempo ? Math.round(pt.tempo) + " BPM" : "tempo unknown"}`));
    };
    const nearest = (evt) => {
      const r = svg.getBoundingClientRect();
      const px = ((evt.clientX - r.left) / r.width) * W;
      return Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    };
    hit.addEventListener("pointermove", (e) => show(nearest(e), e));
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
    hit.addEventListener("focus", (e) => show(focusIdx, e));
    hit.addEventListener("blur", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
    hit.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        focusIdx = Math.max(0, Math.min(n - 1, focusIdx + (e.key === "ArrowRight" ? 1 : -1)));
        const b = hit.getBoundingClientRect();
        show(focusIdx, { clientX: b.left + (b.width * focusIdx) / Math.max(1, n - 1), clientY: b.top });
        e.preventDefault();
      }
    });
    box.replaceChildren(svg);
  };
  requestAnimationFrame(draw);
  let timer;
  new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(draw, 120); }).observe(box);
  return box;
}

function genreArc(p) {
  const segs = [1, 2, 3, 4, 5].map((seg) => bucketShares(p.genre_arc.filter((g) => g.segment === seg)));
  const order = BUCKET_ORDER().filter((b) => segs.some((m) => m.get(b)));
  const legend = h("ul", { class: "legend" }, order.map((b) => h("li", {}, h("i", { style: { background: bucketColor(b) } }), b)));
  const stacks = h("div", { class: "stacks" });
  const positioned = p.tracks.filter((t) => t.position != null).length;
  const bounds = [1, 2, 3, 4, 5].map((seg) => [Math.floor(((seg - 1) * positioned) / 5) + 1, Math.floor((seg * positioned) / 5)]);
  segs.forEach((m, i) => {
    const col = h("div", { class: "stack" });
    for (const b of order) {
      const v = m.get(b) || 0;
      if (!v) continue;
      const inside = b === "Other genres"
        ? p.genre_arc.filter((g) => g.segment === i + 1 && familyBucket(g.family) === b)
          .map((g) => h("div", { class: "k" }, `${g.family} ${pct(g.share)}`))
        : [];
      col.append(hoverable(h("span", { tabindex: "0", style: { height: `${v * 100}%`, background: bucketColor(b) } }),
        () => [h("b", {}, pct(v)), h("div", { class: "k" }, `${b} in songs ${bounds[i][0]}–${bounds[i][1]}`), ...inside]));
    }
    stacks.append(col);
  });
  const labels = h("div", { class: "stack-labels" }, bounds.map(([a, b], i) => h("span", {}, i === 0 ? `Songs ${a}–${b}` : `${a}–${b}`)));
  // the table lists every family unfolded, so nothing hides inside "Other genres"
  const raw = new Map(p.genre_arc.map((g) => [`${g.segment}|${g.family}`, g.share]));
  const allFams = p.families.map((f) => f.family);
  const table = h("details", { class: "table-view" }, h("summary", {}, "See the numbers"),
    h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Genre"), bounds.map(([a, b]) => h("th", { class: "num" }, `${a}–${b}`)))),
      h("tbody", {}, allFams.map((f) => h("tr", {}, h("td", {}, f === "Unknown" ? "No genre tag" : f),
        [1, 2, 3, 4, 5].map((seg) => h("td", { class: "num" }, pct(raw.get(`${seg}|${f}`) || 0)))))))));
  return h("div", {}, legend, stacks, labels, table);
}

function mixStrip(families) {
  const m = bucketShares(families);
  return h("div", { class: "strip", "aria-hidden": "true" },
    BUCKET_ORDER().filter((b) => m.get(b)).map((b) => h("span", { style: { width: `${m.get(b) * 100}%`, background: bucketColor(b) } })));
}

// ---------- views ----------
function viewOverview() {
  const o = D.overview, a = D.about;
  const famItems = o.family_mix.map((f) => ({ label: f.family === "Unknown" ? "No genre tag" : f.family, value: f.share, display: pct(f.share) }));
  const unknown = famItems.find((f) => f.label === "No genre tag");
  const famOrdered = famItems.filter((f) => f !== unknown).concat(unknown ? [unknown] : []);
  return h("div", { class: "reveal" },
    h("h1", {}, `${o.n_playlists_2025} playlists for a day behind the counter`),
    h("p", { class: "lede" },
      `Each one runs about ${Math.round(o.median_hours_unique)} hours, and nearly every song is on it twice, so a playlist lasts ${Math.round(o.median_hours_full)} hours from the first song to the last. These are dj moo's shop playlists as they stood on Spotify in September 2025.`),
    h("ul", { class: "figures" },
      h("li", {}, h("b", {}, fmt(o.n_tracks)), h("span", {}, "different songs")),
      h("li", {}, h("b", {}, fmt(o.n_artists)), h("span", {}, "artists")),
      h("li", {}, h("b", {}, fmt(Math.round(D.playlists.reduce((t, p) => t + (p.hours_full || 0), 0)))), h("span", {}, "hours, counting the repeats")),
      h("li", {}, h("b", {}, `${a.reachable_now} of ${o.n_playlists_2025}`), h("span", {}, "still on Spotify today"))),

    h("section", { class: "section" },
      h("div", { class: "section-head" }, h("h2", {}, "How the playlists differ"),
        h("p", { class: "note" }, "Each row is a playlist, each column a genre. Darker means a bigger share of that playlist's songs. Click a row to open it.")),
      h("div", { class: "panel" }, heatmap(),
        h("div", { class: "heat-scale" }, "0%", h("i", {}), "more of the playlist"))),

    h("section", { class: "section two-col" },
      h("div", {},
        h("h2", {}, "Who shows up most"),
        h("p", { class: "note" }, `Number of playlists (out of ${o.n_playlists_2025}) each artist appears on.`),
        h("div", { class: "panel", style: { marginTop: "12px" } }, barList(o.top_artists.map((t) => ({
          label: t.name, href: `#/artist/${t.id}`, value: t.n_playlists, display: String(t.n_playlists),
          tip: `${t.name}: on ${t.n_playlists} playlists, ${t.n_tracks} different songs` }))))),
      h("div", {},
        h("h2", {}, "What it sounds like"),
        h("p", { class: "note" }, "Share of all songs, grouped from Spotify's artist genre tags. Some artists have no tags."),
        h("div", { class: "panel", style: { marginTop: "12px" } }, barList(famOrdered, { unknownLabel: "No genre tag" })))),

    h("section", { class: "section" },
      h("div", { class: "section-head" }, h("h2", {}, "When it's from"),
        h("p", { class: "note" }, `Release decade of the songs. ${fmt(a.coverage.year_from_musicbrainz)} years come from MusicBrainz's original release dates; the rest use the Spotify album date, which is sometimes a later reissue or compilation.`)),
      h("div", { class: "panel" }, decadeColumns(o.decade_mix))),
  );
}

function viewPlaylists() {
  return h("div", { class: "reveal" },
    h("h1", {}, "All 56 playlists"),
    h("p", { class: "lede" }, "In the order they were pulled. The strip shows each playlist's genre mix."),
    h("ul", { class: "legend", style: { marginTop: "16px" } }, BUCKET_ORDER().map((b) => h("li", {}, h("i", { style: { background: bucketColor(b) } }), b))),
    h("ul", { class: "pl-list" }, D.playlists.map((p) => h("li", {},
      h("a", { class: "pl-row", href: `#/p/${p.key}` },
        h("div", {}, h("div", { class: "pl-name" }, p.name), h("div", { class: "pl-meta" }, `${p.n_tracks} songs · ${hours(p.hours_unique)}`)),
        h("div", {}, h("div", { class: "pl-vibe" }, p.vibe), statusBadge(p)),
        mixStrip(p.families))))));
}

function viewPlaylist(key) {
  const p = byKey.get(key);
  if (!p) return notFound("That playlist");
  const ordered = p.tracks.filter((t) => t.position != null);
  const loose = p.tracks.filter((t) => t.position == null);
  const missingText = (m) => {
    if (m.kind === "artist") return [`${m.label}`, `on ${pct(m.others_median)} of the other playlists, not this one`];
    const label = m.kind === "decade" ? `Songs from the ${m.label}` : m.label;
    return [label, `${pct(m.their_share)} here, ${pct(m.others_median)} on a typical playlist`];
  };
  const changes = p.changes && (p.changes.added || p.changes.removed)
    ? `Since September 2025: ${p.changes.added} songs added, ${p.changes.removed} removed.`
    : p.reachable ? "Still on Spotify with the same songs as in September 2025." : "This playlist is no longer on Spotify; this is the September 2025 copy.";
  const idx = D.playlists.indexOf(p);
  const prev = D.playlists[idx - 1], next = D.playlists[idx + 1];

  return h("div", { class: "reveal" },
    h("p", { class: "crumb" }, h("a", { href: "#/playlists" }, "All playlists"), " / ", `#${p.link_index}`),
    h("h1", {}, `“${p.name}”`, statusBadge(p)),
    h("p", { class: "vibe" }, p.vibe || "Not enough data for a summary."),
    h("p", { class: "note" }, `${p.n_tracks} songs · ${hours(p.hours_unique)} (${hours(p.hours_full)} with the repeats) · ${changes}`),

    h("section", { class: "section" },
      h("div", { class: "section-head" }, h("h2", {}, "Energy, song by song"),
        h("p", { class: "note" }, p.energy_arc ? `Dots are single songs; the line is a running average of nine. ${p.energy_arc.length} of ${ordered.length} songs have energy data.` : "")),
      h("div", { class: "panel" }, p.energy_arc ? energyChart(p.energy_arc, p) : h("p", { class: "empty" }, "Not enough songs with energy data to draw this playlist's arc."))),

    h("section", { class: "section two-col" },
      h("div", {},
        h("h2", {}, "How the genre mix moves"),
        h("p", { class: "note" }, "The playlist split into five stretches, start to finish."),
        h("div", { class: "panel", style: { marginTop: "12px" } }, genreArc(p))),
      h("div", {},
        h("h2", {}, "Notably missing"),
        h("p", { class: "note" }, "Common across Drew's other playlists but rare or absent here."),
        h("div", { class: "panel", style: { marginTop: "12px" } }, p.missing.length
          ? h("ul", { class: "missing" }, p.missing.map((m) => { const [w, n] = missingText(m); return h("li", {}, h("span", { class: "what" }, w), h("span", { class: "nums" }, n)); }))
          : h("p", { class: "empty", style: { margin: 0 } }, "Nothing stands out. This playlist covers the usual ground.")))),

    h("section", { class: "section" },
      h("h2", {}, "The songs"),
      h("p", { class: "note" }, p.reachable
        ? "In the order each song is first heard, from the playlist as it is on Spotify today."
        : "In playlist order, first time through."),
      h("div", { class: "panel table-wrap", style: { marginTop: "12px" } }, trackTable(ordered, true),
        loose.length ? [h("h3", { style: { marginTop: "24px" } }, "Position unknown"),
          h("p", { class: "note" }, "These weren't on the playlist exactly twice in 2025, so the original pull lost their place in the order, and the playlist is no longer on Spotify to check."),
          trackTable(loose, false)] : null)),

    h("p", { class: "crumb", style: { marginTop: "40px" } },
      prev ? h("a", { href: `#/p/${prev.key}` }, `Previous: “${prev.name}”`) : null,
      prev && next ? "   ·   " : null,
      next ? h("a", { href: `#/p/${next.key}` }, `Next: “${next.name}”`) : null));
}

function trackTable(rows, showPos) {
  return h("table", {},
    h("thead", {}, h("tr", {}, showPos ? h("th", {}, "#") : null, h("th", {}, "Song"), h("th", {}, "Artist"), h("th", { class: "num" }, "Year"), h("th", { class: "num" }, "Energy"))),
    h("tbody", {}, rows.map((r) => {
      const t = D.tracks[r.track_id];
      if (!t) return null;
      return h("tr", {},
        showPos ? h("td", { class: "pos" }, r.position + 1) : null,
        h("td", {}, h("a", { href: `#/song/${r.track_id}` }, t.name)),
        h("td", {}, artistLinks(t)),
        h("td", { class: "num" }, t.year ?? h("span", { class: "dim" }, "–")),
        h("td", { class: "num" }, t.energy == null ? h("span", { class: "dim" }, "–")
          : [num2(t.energy), h("span", { class: "meter", "aria-hidden": "true" }, h("i", { style: { width: `${t.energy * 100}%` } }))]));
    })));
}

function playlistChips(keys) {
  return h("ul", { class: "chips" }, keys.map((k) => byKey.get(k)).filter(Boolean)
    .sort((a, b) => a.link_index - b.link_index)
    .map((p) => h("li", {}, h("a", { href: `#/p/${p.key}` }, p.name))));
}

function viewArtist(id) {
  const a = D.artists[id];
  if (!a) return notFound("That artist");
  const songs = Object.entries(D.tracks).filter(([, t]) => t.artists.includes(id))
    .sort((x, y) => y[1].playlists.length - x[1].playlists.length);
  return h("div", { class: "reveal" },
    h("p", { class: "crumb" }, "Artist"),
    h("h1", {}, a.name),
    h("p", { class: "lede" }, `On ${a.playlists.length} of ${D.playlists.length} playlists with ${a.n_tracks} different ${a.n_tracks === 1 ? "song" : "songs"}.`),
    a.genres.length ? h("ul", { class: "chips" }, a.genres.map((g) => h("li", {}, h("span", {}, g)))) : h("p", { class: "note" }, "Spotify has no genre tags for this artist."),
    h("section", { class: "section" }, h("h2", {}, "Playlists"), playlistChips(a.playlists)),
    h("section", { class: "section" }, h("h2", {}, "Songs"),
      h("div", { class: "panel table-wrap", style: { marginTop: "12px" } }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", {}, "Song"), h("th", { class: "num" }, "Year"), h("th", { class: "num" }, "Playlists"))),
        h("tbody", {}, songs.map(([tid, t]) => h("tr", {},
          h("td", {}, h("a", { href: `#/song/${tid}` }, t.name)),
          h("td", { class: "num" }, t.year ?? "–"),
          h("td", { class: "num" }, t.playlists.length))))))));
}

function viewSong(id) {
  const t = D.tracks[id];
  if (!t) return notFound("That song");
  const facts = [
    ["Album", t.album || "–"],
    ["Released", t.year ? `${t.year}${t.year_source === "spotify_album" ? " (album date on Spotify)" : ""}` : "–"],
    ["Energy", num2(t.energy)], ["Mood", num2(t.valence)],
    ["Tempo", t.tempo ? `${Math.round(t.tempo)} BPM` : "–"],
    ["Spotify popularity (2025)", t.popularity_2025 ?? "–"],
  ];
  return h("div", { class: "reveal" },
    h("p", { class: "crumb" }, "Song"),
    h("h1", {}, t.name),
    h("p", { class: "lede" }, artistLinks(t)),
    h("div", { class: "panel", style: { maxWidth: "520px", marginTop: "16px" } }, h("table", {}, h("tbody", {},
      facts.map(([k, v]) => h("tr", {}, h("th", {}, k), h("td", { class: "num" }, v)))))),
    h("section", { class: "section" }, h("h2", {}, `On ${t.playlists.length} ${t.playlists.length === 1 ? "playlist" : "playlists"}`), playlistChips(t.playlists)),
    h("p", { style: { marginTop: "32px" } }, h("a", { href: `https://open.spotify.com/track/${id}`, rel: "noopener", target: "_blank" }, "Open in Spotify")));
}

function viewSearch(q) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return h("div", {}, h("h1", {}, "Search"), h("p", { class: "empty" }, "Type at least two letters to search songs, artists and playlists."));
  const artists = Object.entries(D.artists).filter(([, a]) => a.name.toLowerCase().includes(needle))
    .sort((x, y) => y[1].playlists.length - x[1].playlists.length).slice(0, 30);
  const songs = Object.entries(D.tracks).filter(([, t]) => t.name.toLowerCase().includes(needle))
    .sort((x, y) => y[1].playlists.length - x[1].playlists.length).slice(0, 60);
  const pls = D.playlists.filter((p) => p.name.toLowerCase().includes(needle));
  return h("div", {},
    h("h1", {}, `“${q.trim()}”`),
    !artists.length && !songs.length && !pls.length ? h("p", { class: "empty" }, "No songs, artists or playlists match. Try part of a name.") : null,
    pls.length ? h("section", { class: "section" }, h("h2", {}, "Playlists"), playlistChips(pls.map((p) => p.key))) : null,
    artists.length ? h("section", { class: "section" }, h("h2", {}, "Artists"),
      h("ul", { class: "chips" }, artists.map(([id, a]) => h("li", {}, h("a", { href: `#/artist/${id}` }, `${a.name} (${a.playlists.length})`))))) : null,
    songs.length ? h("section", { class: "section" }, h("h2", {}, "Songs"),
      h("div", { class: "panel table-wrap", style: { marginTop: "12px" } }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", {}, "Song"), h("th", {}, "Artist"), h("th", { class: "num" }, "Playlists"))),
        h("tbody", {}, songs.map(([id, t]) => h("tr", {}, h("td", {}, h("a", { href: `#/song/${id}` }, t.name)),
          h("td", {}, artistLinks(t)), h("td", { class: "num" }, t.playlists.length))))))) : null);
}

function viewAbout() {
  const c = D.about.coverage;
  return h("div", { class: "prose reveal" },
    h("h1", {}, "About the data"),
    h("p", { class: "lede" }, "Where these numbers come from, and where they fall short."),
    h("h2", {}, "The playlists"),
    h("ul", {},
      h("li", {}, `All ${D.playlists.length} playlists belong to the Spotify user dj moo. Their songs were pulled from Spotify on 27 September 2025, and that copy is what every number here describes.`),
      h("li", {}, `Checked again on ${D.about.live_checked}: ${D.about.reachable_now} are still on Spotify. The others now return “not found”, so they were deleted or made private, and the 2025 copy is the only one.`),
      h("li", {}, "Nearly every song appears on its playlist twice. A guess, not something we know: that's so a playlist covers a full day without running out."),
      h("li", {}, `Song order comes from today's Spotify copy for the ${D.about.reachable_now} playlists still there, and from the 2025 pull for the rest. The 2025 pull lost the place of songs that weren't on their playlist exactly twice; for the gone playlists that leaves ${fmt(c.positionless_rows)} songs with an unknown position. They're listed separately and left out of the arcs.`)),
    h("h2", {}, "Genres"),
    h("p", {}, `Genres are the tags Spotify gives artists, not individual songs. They're grouped into about a dozen broad families, so "classic soul" and "northern soul" both count as Soul, for example. ${pct(1 - c.with_genre / c.tracks)} of songs are by artists with no Spotify tags at all; they show as "no genre tag" rather than being guessed.`),
    h("h2", {}, "Energy and mood"),
    h("p", {}, `Energy (how intense a song feels, 0 to 1), mood (how positive it sounds, 0 to 1) and tempo come from ReccoBeats, a free service that estimates the audio measures Spotify used to publish. They cover ${fmt(c.with_energy)} of ${fmt(c.tracks)} songs (${pct(c.with_energy / c.tracks)}). The rest show as blank, never as zero. Treat them as estimates.`),
    h("h2", {}, "Release years"),
    h("p", {}, `Where MusicBrainz knows a recording's first release, that year is used (${fmt(c.year_from_musicbrainz)} songs). Otherwise it's the album date on Spotify, which for older songs is often a later remaster or compilation. That makes the collection look more recent than it really is.`),
    h("h2", {}, "\"Notably missing\""),
    h("p", {}, "For each playlist, a genre or decade is flagged when it makes up at least 5% of a typical playlist (the median of all the others) but a quarter of that or less here. Genre shares here count only songs with a genre tag, so playlists with many untagged artists aren't penalized. An artist is flagged when they're on at least 60% of the other playlists and not this one."),
    h("p", { class: "note", style: { marginTop: "40px" } }, `Put together by Taylor Andrews. Data last rebuilt ${D.generated}.`));
}

function notFound(what) {
  return h("div", {}, h("h1", {}, "Not found"), h("p", { class: "empty" }, `${what} isn't in this data. `, h("a", { href: "#/" }, "Back to the overview")));
}

// ---------- router ----------
const app = document.getElementById("app");
const search = document.getElementById("search");
function route() {
  hideTip();
  const hash = decodeURIComponent(location.hash.slice(1) || "/");
  const [, view, arg] = hash.match(/^\/([^/?]*)\/?([^?]*)/) || [];
  let node, tab = null, title = "What's Playing at the Shop";
  if (!view) { node = viewOverview(); tab = "overview"; }
  else if (view === "playlists") { node = viewPlaylists(); tab = "playlists"; title = "All playlists"; }
  else if (view === "p") { node = viewPlaylist(arg); tab = "playlists"; title = byKey.get(arg) ? `“${byKey.get(arg).name}”` : title; }
  else if (view === "artist") { node = viewArtist(arg); title = D.artists[arg]?.name || title; }
  else if (view === "song") { node = viewSong(arg); title = D.tracks[arg]?.name || title; }
  else if (view === "about") { node = viewAbout(); tab = "about"; title = "About the data"; }
  else if (view === "search") { node = viewSearch(arg); title = "Search"; }
  else node = notFound("That page");
  document.title = title === "What's Playing at the Shop" ? title : `${title} · What's playing at the shop`;
  for (const a of document.querySelectorAll(".tabs a")) {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  app.replaceChildren(node);
  if (view !== "search") window.scrollTo(0, 0);
}
let searchTimer;
search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = search.value;
    if (q.trim()) history.replaceState(null, "", `#/search/${encodeURIComponent(q)}`);
    route();
  }, 150);
});

fetch("site_data.json")
  .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
  .then((data) => {
    D = data;
    for (const p of D.playlists) byKey.set(p.key, p);
    FAMILY_SLOTS = D.overview.family_mix.map((f) => f.family).filter((f) => f !== "Unknown" && f !== "Other").slice(0, 8);
    window.addEventListener("hashchange", route);
    route();
  })
  .catch((e) => { app.replaceChildren(h("p", { class: "empty" }, `The playlist data didn't load (${e.message}). Reload the page to try again.`)); });
