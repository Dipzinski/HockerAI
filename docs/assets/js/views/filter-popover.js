// The Filter popover for the lead list: state, industry, signal and readiness.

import { SIGNALS } from "../data.js";
import { el } from "../dom.js";

function selectField(label, value, options, onChange) {
  const select = el("select", { onChange: (e) => onChange(e.target.value || null) },
    options.map((o) => el("option", { value: o.value, selected: o.value === (value || ""), text: o.label })));
  return el("label", { class: "field" }, label, el("span", { class: "select" }, select));
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.anchor button the popover hangs from
 * @param {HTMLElement} opts.host positioned container to render into
 * @param {object} opts.data prepared lead data
 * open(getFilters, onChange): getFilters returns the live filters, so several changes
 * in a row build on each other; onChange receives the next filters.
 */
export function createFilterPopover({ anchor, host, data }) {
  let node = null;
  let onOutside = null;

  /** restoreFocus: return focus to the Filters button (Done, Escape), not after an outside click. */
  function close({ restoreFocus = false } = {}) {
    if (!node) return;
    node.remove();
    node = null;
    document.removeEventListener("pointerdown", onOutside, true);
    anchor.setAttribute("aria-expanded", "false");
    if (restoreFocus) anchor.focus();
  }

  function open(getFilters, onChange) {
    close();
    const filters = getFilters();
    const update = (patch) => onChange({ ...getFilters(), ...patch });
    node = el("div", { class: "popover glass", id: "filter-popover", role: "dialog", "aria-label": "Filters" },
      selectField("State", filters.state,
        [{ value: "", label: "All states" }, ...data.territory.map((s) => ({ value: s, label: s }))],
        (state) => update({ state })),
      selectField("Industry", filters.industry,
        [{ value: "", label: "All industries" }, ...data.industries.map((i) => ({ value: i, label: i }))],
        (industry) => update({ industry })),
      selectField("Signal", filters.signal,
        [{ value: "", label: "Any signal" }, ...SIGNALS.map((s) => ({ value: s.id, label: s.label }))],
        (signal) => update({ signal })),
      el("label", { class: "switch" }, "Outreach-ready only",
        el("input", { type: "checkbox", role: "switch", checked: filters.readyOnly,
          onChange: (e) => update({ readyOnly: e.target.checked }) })),
      el("div", { class: "popover-foot" },
        el("button", { class: "text-btn", type: "button", text: "Reset",
          onClick: () => {
            onChange({ ...getFilters(), state: null, industry: null, signal: null, readyOnly: false });
            open(getFilters, onChange);
          } }),
        el("button", { class: "pill-btn", type: "button", text: "Done", onClick: () => close({ restoreFocus: true }) })));
    node.style.top = `${anchor.offsetTop + anchor.offsetHeight + 8}px`;
    node.style.right = "12px";
    // Right after the button in DOM order, so Tab moves from Filters into the popover and on.
    anchor.after(node);
    anchor.setAttribute("aria-expanded", "true");
    node.querySelector("select")?.focus();
    onOutside = (e) => {
      if (node && !node.contains(e.target) && !anchor.contains(e.target)) close();
    };
    document.addEventListener("pointerdown", onOutside, true);
  }

  return { open, close, isOpen: () => Boolean(node) };
}
