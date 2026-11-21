import copy

from hocker import verify

FACTS = {
    "as_of": "2026-09-23",
    "facility": {"name": "Great Lakes Millwork", "city": "Grand Rapids", "state": "MI",
                 "industry": "Woodworking, cabinets & furniture", "naics": "337110", "employees_at_site": 60},
    "inspections": [
        {"inspection_id": "1745001", "opened": "2026-03-04", "dust_program": "Combustible Dust NEP",
         "citation_count": 2,
         "citations": [
             {"standard": "29 CFR 1910.94(a)(1)", "title": "Ventilation", "category": "dust",
              "type": "Serious", "issued": "2026-05-01", "penalty_usd": 8275},
             {"standard": "29 CFR 1910.22(a)(1)", "title": "Housekeeping", "category": "adjacent",
              "type": "Serious", "issued": "2026-05-01", "penalty_usd": 4100},
         ],
         "other_citations": 3},
    ],
}

GOOD = {
    "why_now": "The public record documents that Great Lakes Millwork was cited for ventilation during "
               "a May 2026 Combustible Dust NEP inspection. This is a research hypothesis for a "
               "representative to verify; it is not evidence that the site needs an upgrade or intends "
               "to buy equipment.",
    "talking_points": [
        {"point": "Cited for ventilation (1910.94) with an $8,275 penalty on 2026-05-01.",
         "inspection_ids": ["1745001"]},
        {"point": "2 citations in the March 2026 inspection, both dust-related.",
         "inspection_ids": ["1745001"]},
    ],
    "suggested_contact_role": "Plant Manager",
    "email_subject": "Dust collection at your Grand Rapids plant",
    "email_body": "Hello,\n\nOSHA's public records show a 2026 inspection of your Grand Rapids plant "
                  "focused on dust. We design dust collection systems for woodworking plants with "
                  "about 60 people on site. Would a 20-minute call to walk your line be useful?\n\n"
                  "[Rep name]\nHocker North America",
}


def draft(**changes):
    d = copy.deepcopy(GOOD)
    d.update(changes)
    return d


def test_faithful_draft_passes():
    result = verify.check(GOOD, FACTS)
    assert result.passed, result.issues


def test_verifier_does_not_semantically_certify_unsupported_claims():
    # These claims are deliberately adversarial: the mechanical checker does not
    # know the plant's processes, plans, intent, or purchase timing.
    for claim in (
        "The plant sands hardwood.",
        "The plant plans ventilation upgrades.",
        "The plant intends to buy a collector.",
        "The plant needs to act this month.",
    ):
        result = verify.check(draft(why_now=claim), FACTS)
        assert result.passed


def test_made_up_penalty_is_caught():
    tp = [{"point": "Cited with a $12,500 penalty.", "inspection_ids": ["1745001"]}]
    result = verify.check(draft(talking_points=tp), FACTS)
    assert not result.passed and any("12500" in i for i in result.issues)


def test_unknown_inspection_id_is_caught():
    tp = [{"point": "Cited for ventilation.", "inspection_ids": ["9999999"]}]
    result = verify.check(draft(talking_points=tp), FACTS)
    assert any("unknown inspection ID 9999999" in i for i in result.issues)


def test_point_without_source_is_caught():
    tp = [{"point": "Cited for ventilation.", "inspection_ids": []}]
    assert not verify.check(draft(talking_points=tp), FACTS).passed


def test_wrong_count_is_caught():
    tp = [{"point": "7 dust citations since 2026.", "inspection_ids": ["1745001"]}]
    result = verify.check(draft(talking_points=tp), FACTS)
    assert any(verify.kind(i) == "wrong count" for i in result.issues)


def test_computed_total_is_caught():
    # 8,275 + 4,100 = 12,375: a real sum, but not a number in the records.
    result = verify.check(draft(why_now="Penalties total $12,375 this year."), FACTS)
    assert any("12375" in i for i in result.issues)


def test_banned_topics_are_caught():
    body = GOOD["email_body"].replace("focused on dust.", "focused on dust after an injury.")
    assert any(verify.kind(i) == "banned topic" for i in verify.check(draft(email_body=body), FACTS).issues)
    body = GOOD["email_body"].replace("Would", "We guarantee compliance. Would")
    assert any(verify.kind(i) == "banned topic" for i in verify.check(draft(email_body=body), FACTS).issues)


def test_email_rules():
    body = GOOD["email_body"].replace("focused on dust.", "with an $8,275 penalty.")
    assert any(verify.kind(i) == "dollar amount in email" for i in verify.check(draft(email_body=body), FACTS).issues)
    assert any(verify.kind(i) == "missing sign-off"
               for i in verify.check(draft(email_body="Hello,\n\nCall me.\n\nThanks"), FACTS).issues)
    long_body = "word " * 200 + "\n[Rep name]\nHocker North America"
    assert any(verify.kind(i) == "email too long" for i in verify.check(draft(email_body=long_body), FACTS).issues)
