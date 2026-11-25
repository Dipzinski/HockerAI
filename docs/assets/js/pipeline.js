// Pipeline stages a rep sets by hand. Saved in this browser only.

export const PIPELINE_KEY = "hocker_pipeline_v5";
const LEGACY_KEY = "hocker_pipeline_spaceblack_v4";

export const STAGES = [
  { id: "top", label: "Not contacted" },
  { id: "reached", label: "Reached out" },
  { id: "contact", label: "In contact" },
  { id: "audit", label: "Assessment booked" },
  { id: "hold", label: "On hold" },
];
const STAGE_IDS = new Set(STAGES.map((s) => s.id));

export function stageLabel(id) {
  const stage = STAGES.find((s) => s.id === id);
  return stage ? stage.label : id;
}

function readSaved(storage) {
  try {
    storage.removeItem(LEGACY_KEY);
    const text = storage.getItem(PIPELINE_KEY);
    if (!text) return {};
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => STAGE_IDS.has(v)));
  } catch (err) {
    console.warn("Ignoring unreadable saved pipeline", err);
    return {};
  }
}

export function createPipeline(storage) {
  let saved = readSaved(storage);

  function stageOf(lead) {
    return saved[lead.id] || (lead.hold ? "hold" : "top");
  }

  function setStage(id, stage) {
    if (!STAGE_IDS.has(stage)) throw new Error(`Unknown stage: ${stage}`);
    saved = { ...saved, [id]: stage };
    try {
      storage.setItem(PIPELINE_KEY, JSON.stringify(saved));
    } catch (err) {
      console.warn("Could not save the pipeline in this browser", err);
    }
  }

  function counts(leads) {
    const tally = Object.fromEntries(STAGES.map((s) => [s.id, 0]));
    for (const lead of leads) tally[stageOf(lead)] += 1;
    return tally;
  }

  return { stageOf, setStage, counts };
}
