"""Parse OSHA citation codes and classify them by how closely they relate to dust.

OSHA stores the cited standard as a compact code, e.g. "19100094 A01 I" for
29 CFR 1910.94(a)(1)(i). Michigan runs its own state plan (MIOSHA) and cites
Michigan rules instead, e.g. "325.52001(1)" for R 325.52001 (Part 520,
Ventilation Control). This module turns both into a readable citation and one of
three categories:

- DUST: the standard exists to control airborne dust or particulate
  (ventilation, air-contaminant limits, silica, metal dusts, grain dust).
- ADJACENT: often cited where dust is present but not specific to it
  (housekeeping, respirators, spray booths, welding, classified locations).
- OTHER: everything else (lockout/tagout, machine guarding, forklifts, ...).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

DUST = "dust"
ADJACENT = "adjacent"
OTHER = "other"


@dataclass(frozen=True)
class Standard:
    code: str      # raw code from the OSHA data
    citation: str  # readable form, e.g. "29 CFR 1910.94(a)(1)(i)"
    title: str
    category: str


# 29 CFR 1910 (federal general industry) sections, by section number.
FEDERAL_1910 = {
    # DUST
    94: ("Ventilation (grinding, abrasive blasting, spray finishing)", DUST),
    272: ("Grain handling facilities", DUST),
    1000: ("Air contaminants (exposure limits)", DUST),
    1018: ("Inorganic arsenic", DUST),
    1024: ("Beryllium", DUST),
    1025: ("Lead", DUST),
    1026: ("Chromium (VI)", DUST),
    1027: ("Cadmium", DUST),
    1053: ("Respirable crystalline silica", DUST),
    # ADJACENT
    22: ("Walking-working surfaces: housekeeping", ADJACENT),
    107: ("Spray finishing using flammable materials", ADJACENT),
    134: ("Respiratory protection", ADJACENT),
    252: ("Welding, cutting, and brazing", OTHER),  # paragraph (c), ventilation, is ADJACENT
    307: ("Hazardous (classified) locations", ADJACENT),
    # OTHER (titles only, for readable briefs)
    23: ("Ladders", OTHER),
    24: ("Step bolts and manhole steps", OTHER),
    28: ("Fall protection", OTHER),
    29: ("Fall protection systems", OTHER),
    36: ("Exit routes: design and construction", OTHER),
    37: ("Exit routes: maintenance", OTHER),
    95: ("Occupational noise exposure", OTHER),
    119: ("Process safety management", OTHER),
    132: ("Personal protective equipment: general", OTHER),
    133: ("Eye and face protection", OTHER),
    138: ("Hand protection", OTHER),
    141: ("Sanitation", OTHER),
    146: ("Permit-required confined spaces", OTHER),
    147: ("Control of hazardous energy (lockout/tagout)", OTHER),
    151: ("Medical services and first aid", OTHER),
    157: ("Portable fire extinguishers", OTHER),
    176: ("Materials handling and storage", OTHER),
    178: ("Powered industrial trucks", OTHER),
    179: ("Overhead and gantry cranes", OTHER),
    184: ("Slings", OTHER),
    212: ("Machine guarding: general requirements", OTHER),
    213: ("Woodworking machinery", OTHER),
    215: ("Abrasive wheel machinery", OTHER),
    217: ("Mechanical power presses", OTHER),
    219: ("Mechanical power-transmission apparatus", OTHER),
    242: ("Hand and portable powered tools", OTHER),
    253: ("Oxygen-fuel gas welding and cutting", OTHER),
    263: ("Bakery equipment", OTHER),
    265: ("Sawmills", OTHER),
    303: ("Electrical: general requirements", OTHER),
    304: ("Electrical: wiring design and protection", OTHER),
    305: ("Electrical: wiring methods", OTHER),
    333: ("Electrical: safety-related work practices", OTHER),
    1030: ("Bloodborne pathogens", OTHER),
    1200: ("Hazard communication", OTHER),
}

# MIOSHA occupational health rules (R 325.xxxxx) come in number ranges, one per part.
MIOSHA_325 = (
    (51101, 51108, "Part 301 Air Contaminants", DUST),
    (52001, 52012, "Part 520 Ventilation Control", DUST),
    (50251, 50258, "Part 523 Abrasive Blasting", DUST),
    (52501, 52506, "Part 525 Grinding, Polishing, and Buffing", DUST),
    (59001, 59015, "Part 590 Silica in General Industry", DUST),
    (51901, 51942, "Part 310 Lead in General Industry", DUST),
    (51851, 51886, "Part 309 Cadmium in General Industry", DUST),
    (50141, 50143, "Part 315 Chromium (VI) in General Industry", DUST),
    (34001, 34010, "Part 340 Beryllium", DUST),
    (60051, 60052, "Part 451 Respiratory Protection", ADJACENT),
    (52901, 52931, "Part 529 Welding, Cutting, and Brazing", ADJACENT),
    (47201, 47201, "Part 472 Medical Services and First Aid", OTHER),
    (47401, 47425, "Part 474 Sanitation", OTHER),
    (60001, 60013, "Part 433 Personal Protective Equipment", OTHER),
    (60101, 60128, "Part 380 Noise Exposure", OTHER),
    (63001, 63049, "Part 490 Permit-Required Confined Spaces", OTHER),
    (70001, 70018, "Part 554 Bloodborne Infectious Diseases", OTHER),
    (77001, 77004, "Part 430 Hazard Communication", OTHER),
)

# MIOSHA general industry safety rules are numbered R 408.1PPRR (part PP, rule RR);
# Part 1 is the exception (R 408.10001-10098).
MIOSHA_408_PARTS = {
    1: "Part 1 General Provisions", 2: "Part 2 Walking-Working Surfaces",
    7: "Part 7 Guards for Power Transmission", 8: "Part 8 Portable Fire Extinguishers",
    11: "Part 11 Polishing, Buffing & Abrading", 12: "Part 12 Welding and Cutting",
    14: "Part 14 Conveyors", 18: "Part 18 Overhead and Gantry Cranes",
    21: "Part 21 Powered Industrial Trucks", 23: "Part 23 Hydraulic Power Presses",
    24: "Part 24 Mechanical Power Presses", 26: "Part 26 Metalworking Machinery",
    27: "Part 27 Woodworking Machinery", 33: "Part 33 Personal Protective Equipment",
    38: "Part 38 Hand and Portable Powered Tools", 39: "Part 39 Electrical Systems",
    40: "Part 40 Safety-Related Work Practices", 44: "Part 44 Foundries",
    45: "Part 45 Die Casting", 49: "Part 49 Slings", 52: "Part 52 Sawmills",
    58: "Part 58 Aerial Work Platforms", 62: "Part 62 Plastic Molding",
    65: "Part 65 Mills and Calenders for Rubber and Plastic",
    76: "Part 76 Spray Finishing", 77: "Part 77 Grain Handling Facilities",
    81: "Part 81 Baking Operations", 85: "Part 85 Control of Hazardous Energy",
    90: "Part 90 Permit-Required Confined Spaces", 92: "Part 92 Hazard Communication",
}
# Parts 11 (abrasive wheels) and 12 (welding) are equipment-safety rules; their dust and fume
# counterparts are health Parts 525 and 529 above.
MIOSHA_408_CATEGORY = {77: DUST, 76: ADJACENT}
MIOSHA_HOUSEKEEPING_RULE = 10015  # R 408.10015 Housekeeping (Part 1)

_FEDERAL = re.compile(r"^(19\d\d)(\d{4})\s*(.*)$")
_MIOSHA = re.compile(r"^(325|408)\.(\d{4,5})([a-z]?)\s*(.*)$", re.IGNORECASE)
_PARAGRAPH = re.compile(r"([A-Z])(\d{2})")


def _federal_paragraphs(rest: str) -> str:
    """Turn OSHA's paragraph code ("A01 I A") into "(a)(1)(i)(A)"."""
    out = []
    for i, token in enumerate(rest.split()):
        m = _PARAGRAPH.fullmatch(token)
        if m:
            out.append(f"({m.group(1).lower()})({int(m.group(2))})")
        elif i >= 1 and re.fullmatch(r"[IVX]+", token):
            out.append(f"({token.lower()})")
        else:
            out.append(f"({token})")
    return "".join(out)


def parse(code: str | None) -> Standard:
    """Parse one citation code from the violation table."""
    raw = (code or "").strip()
    upper = raw.upper()

    m = _FEDERAL.match(upper)
    if m:
        part, section, rest = m.group(1), int(m.group(2)), m.group(3)
        citation = f"29 CFR {part}.{section}{_federal_paragraphs(rest)}"
        if part == "1910" and section == 252 and rest.startswith("C"):
            title, category = "Welding: health protection and ventilation", ADJACENT
        elif part == "1910" and section in FEDERAL_1910:
            title, category = FEDERAL_1910[section]
        elif part == "1904":
            title, category = "Injury and illness recordkeeping", OTHER
        elif part == "1903":
            title, category = "Inspections, citations, and penalties", OTHER
        elif part == "1926":
            title, category = "Construction standard", OTHER
        else:
            title, category = f"{part}.{section}", OTHER
        return Standard(raw, citation, title, category)

    if upper.startswith("5A0001"):
        return Standard(raw, "OSH Act 5(a)(1)", "General Duty Clause", OTHER)

    if upper.startswith("408.1011"):
        return Standard(raw, "MCL 408.1011", "Michigan general duty clause", OTHER)

    m = _MIOSHA.match(raw)
    if m:
        series, number = m.group(1), int(m.group(2))
        citation = f"Mich. R {series}.{m.group(2)}{m.group(3)}{m.group(4)}".strip()
        if series == "325":
            for lo, hi, title, category in MIOSHA_325:
                if lo <= number <= hi:
                    return Standard(raw, citation, f"MIOSHA {title}", category)
            return Standard(raw, citation, "MIOSHA occupational health rule", OTHER)
        if 10000 <= number <= 19999:
            part = (number // 100) % 100 or 1
            title = MIOSHA_408_PARTS.get(part, f"Part {part}")
            if number == MIOSHA_HOUSEKEEPING_RULE:
                return Standard(raw, citation, "MIOSHA Part 1 Housekeeping", ADJACENT)
            return Standard(raw, citation, f"MIOSHA {title}", MIOSHA_408_CATEGORY.get(part, OTHER))
        if 22101 <= number <= 22199:
            return Standard(raw, citation, "MIOSHA Part 11 Recordkeeping", OTHER)
        return Standard(raw, citation, "MIOSHA rule", OTHER)

    return Standard(raw, raw or "unknown", "State or other rule", OTHER)
