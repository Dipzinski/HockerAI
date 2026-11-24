// One lead: facts, pipeline stage, the explained score, status, OSHA and EPA records.

import { leadStatus, FOLDERS } from "../data.js";
import { STAGES } from "../pipeline.js";
import { breakdown, formatDate, tierLine, whyLabel } from "../score.js";
import { el, icon, fmt, safeUrl } from "../dom.js";
import { buildHash } from "../router.js";
import { filterMeter, groupMeter, factorPleats } from "../widgets/filter-meter.js";

let whyOpen = false;
let lastAnimated = null;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function stageSelect(lead, ctx) {
  const current = ctx.pipeline.stageOf(lead);
  const select = el("select", { "aria-label": "Pipeline stage",
    onChange: (e) => ctx.onStageChange(lead, e.target.value) },
  STAGES.map((s) => el("option", { value: s.id, selected: s.id === current, text: s.label })));
  return el("span", { class: "select stage-select" }, select);
}

function header(lead, ctx) {
  const firstRecord = safeUrl(lead.inspections[0]?.url);
  const people = lead.employees == null ? "headcount unknown" : `${fmt(lead.employees)} employees`;
  return el("header", { class: "detail-head" },
    el("div", { class: "eyebrow" },
      el("span", { class: lead.tier === "Hot" ? "tag hot" : "tag", text: lead.tier }),
      lead.hold ? el("span", { class: "tag hold" }, el("span", { class: "dot" }), "On hold") : null,
      el("span", { text: `Rank ${fmt(lead.rank)} of ${fmt(ctx.data.leads.length)}` })),
    el("h1", { class: "detail-title", id: "detail-title", text: lead.name }),
    el("p", { class: "facts", text: `${lead.city}, ${lead.state} ${lead.zip || ""} · ${lead.industry} · ${people}` }),
    el("div", { class: "detail-actions" }, stageSelect(lead, ctx),
      firstRecord ? el("a", { class: "pill-btn", href: firstRecord, target: "_blank", rel: "noopener noreferrer" },
        "OSHA record", icon("external")) : null));
}

function factorRow(row) {
  return el("li", { class: "factor", id: `factor-${row.key}`, tabindex: "-1", "data-factor": row.key },
    factorPleats(row.points, row.max),
    el("div", {},
      el("div", { class: "factor-name", text: row.label }),
      el("div", { class: "factor-reason", text: row.reason }),
      el("div", { class: "factor-rule", text: row.rule })),
    el("span", { class: row.points === row.max ? "factor-pts full" : "factor-pts", text: `${row.points}/${row.max}` }));
}

function scoreCard(lead, ctx) {
  const panelId = `why-${lead.id}`;
  const panel = el("div", { class: "why", id: panelId, hidden: !whyOpen },
    el("ol", { class: "factor-list" }, breakdown(lead, ctx.data.asOf).map(factorRow)),
    el("p", { class: "tier-line", text: tierLine(lead) }),
    el("a", { href: "#/scoring" }, "How scoring works"));
  const setOpen = (open) => {
    whyOpen = open;
    toggle.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
  };
  const toggle = el("button", { class: "text-btn why-toggle", type: "button",
    "aria-expanded": String(whyOpen), "aria-controls": panelId,
    onClick: () => setOpen(!whyOpen) }, whyLabel(lead), icon("chevronRight"));
  const showFactor = (key) => {
    setOpen(true);
    panel.querySelectorAll(".factor.hl").forEach((n) => n.classList.remove("hl"));
    const row = panel.querySelector(`[data-factor="${key}"]`);
    if (!row) return;
    row.classList.add("hl");
    row.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    row.focus({ preventScroll: true });
  };
  const animate = lastAnimated !== lead.id;
  lastAnimated = lead.id;
  return el("section", { class: "card", "aria-label": "Score" },
    el("div", { class: "score-top" },
      el("div", { class: "score-num" },
        el("span", { class: "big" }, String(lead.score.total), el("small", { text: "/12" })),
        el("span", { class: "tier-word", text: `${lead.tier} lead` })),
      el("div", { class: "score-meter" }, groupMeter(lead.score, { onGroup: showFactor, animate }))),
    toggle, panel);
}

function statusCard(lead) {
  return el("section", { class: lead.hold ? "card status-card hold" : "card status-card", "aria-label": "Status" },
    icon(lead.hold ? "warning" : "shield"), el("p", { text: leadStatus(lead) }));
}

function citationItem(c) {
  const meta = [c.type, c.penalty_usd ? `$${fmt(c.penalty_usd)} penalty` : null, `issued ${formatDate(c.issued)}`]
    .filter(Boolean).join(" · ");
  return el("li", { class: "cite" },
    el("div", {}, el("span", { class: "cite-std", text: c.standard }), ` ${c.title}`),
    el("div", { class: "cite-meta" }, meta, c.under_contest ? el("span", { class: "contest", text: " · Under contest" }) : null));
}

function inspectionItem(insp) {
  const url = safeUrl(insp.url);
  const name = `Inspection ${insp.inspection_id}`;
  return el("li", {},
    el("div", { class: "insp-head" },
      url ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, name, icon("external"))
        : el("strong", { text: name }),
      el("span", { class: "insp-date", text: `opened ${formatDate(insp.opened)}` }),
      insp.dust_program ? el("span", { class: "tag hot", text: insp.dust_program }) : null),
    insp.citations.length ? el("ul", { class: "cites" }, insp.citations.map(citationItem)) : null,
    insp.other_citations ? el("div", { class: "more-cites",
      text: `${insp.other_citations} other citation${insp.other_citations === 1 ? "" : "s"}, not dust-related` }) : null);
}

function oshaSection(lead) {
  if (!lead.inspections.length) return null;
  return el("section", { "aria-labelledby": "osha-title" },
    el("h2", { class: "section-title", id: "osha-title", text: "OSHA inspections" }),
    el("p", { class: "section-note", text: "A citation is an allegation until it is final. Check the public record before contacting anyone." }),
    el("div", { class: "card", style: "padding:0;margin-top:10px" },
      el("ul", { class: "grouped" }, lead.inspections.map(inspectionItem))));
}

function triSection(lead) {
  const tri = lead.tri_air_signal;
  if (!tri) return null;
  return el("section", { "aria-labelledby": "tri-title" },
    el("h2", { class: "section-title", id: "tri-title", text: "EPA Toxics Release Inventory" }),
    el("div", { class: "card", style: "margin-top:10px" },
      el("p", { class: "factor-reason",
        text: `${fmt(tri.release_lbs)} lb of metal air releases reported for ${tri.reporting_year}.` }),
      el("p", { class: "factor-rule", text: tri.chemicals.join("; ") }),
      el("p", { class: "factor-rule", text: "Reporting is not a violation or proof that the site needs dust collection." })));
}

function backBar(route) {
  const folder = FOLDERS.find((f) => f.id === route.folder);
  return el("div", { class: "detail-bar" },
    el("a", { class: "back-link", href: buildHash({ ...route, id: null }) }, icon("chevronLeft"), folder ? folder.label : "Leads"));
}

export function renderDetail(container, lead, ctx, route) {
  if (!lead) {
    container.replaceChildren(el("div", { class: "detail-empty" },
      filterMeter({ industry: 3, dust: 3, recency: 3, size: 2, tri_air: 1, total: 12 }, "lg"),
      el("strong", { text: "Select a lead" }),
      el("span", { text: "Each pleat is one point of a 12-point score built from OSHA and EPA records." })));
    return;
  }
  container.replaceChildren(backBar(route),
    el("article", { class: "detail", "aria-labelledby": "detail-title" },
      header(lead, ctx), scoreCard(lead, ctx), statusCard(lead), oshaSection(lead), triSection(lead)));
  container.scrollTop = 0;
}
