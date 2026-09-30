from hocker.standards import ADJACENT, DUST, OTHER, parse


def test_federal_code_becomes_readable_citation():
    s = parse("19100147 C07 I A")
    assert s.citation == "29 CFR 1910.147(c)(7)(i)(A)"
    assert s.category == OTHER  # lockout/tagout is not a dust signal


def test_federal_dust_standards():
    assert parse("19101053 D01").category == DUST      # silica
    assert parse("19100094 B02").category == DUST      # grinding/blasting ventilation
    assert parse("19101000 A02").category == DUST      # air contaminants
    assert parse("19100134 C01").category == ADJACENT  # respirators
    assert parse("19100022 A01").category == ADJACENT  # housekeeping


def test_welding_only_ventilation_paragraph_counts():
    assert parse("19100252 C01 I").category == ADJACENT
    assert parse("19100252 A02 IV").category == OTHER


def test_michigan_health_rules_use_number_ranges():
    assert parse("325.52001(1)").title == "MIOSHA Part 520 Ventilation Control"
    assert parse("325.52001(1)").category == DUST
    assert parse("325.51103(2)").category == DUST       # Part 301 air contaminants
    assert parse("325.51135").category == OTHER         # Part 511 labor camps share the prefix
    assert parse("325.60051(1)").category == ADJACENT   # Part 451 respiratory protection


def test_michigan_safety_rules_map_to_parts():
    assert parse("408.12154(1)").title == "MIOSHA Part 21 Powered Industrial Trucks"
    assert parse("408.10034(9)").title == "MIOSHA Part 1 General Provisions"
    assert parse("408.10015(1)").category == ADJACENT   # R 408.10015 housekeeping
    assert parse("408.17701").category == DUST          # Part 77 grain handling
    assert parse("408.22141(2)").category == OTHER      # recordkeeping


def test_general_duty_clauses():
    assert parse("5A0001").citation == "OSH Act 5(a)(1)"
    assert parse("408.1011(A)").citation == "MCL 408.1011"


def test_unknown_codes_do_not_crash():
    assert parse(None).category == OTHER
    assert parse("RULE 12").category == OTHER
