from hocker.facilities import names_similar, normalize_address, normalize_name, resolve, zip5


def test_name_normalization_drops_suffixes_and_dba():
    assert normalize_name("Sauder Woodworking Co.") == "SAUDER WOODWORKING"
    assert normalize_name("SAUDER WOODWORKING COMPANY") == "SAUDER WOODWORKING"
    assert normalize_name("Acme Metal, L.L.C.") == "ACME METAL"
    assert normalize_name("Appalachian Wood Floors, Inc. dba Graf Custom Hardwood") == "APPALACHIAN WOOD FLOORS"
    assert normalize_name("110584 - MOLDED ACOUSTICAL PRODUCTS INC") == "MOLDED ACOUSTICAL PRODUCTS"


def test_address_normalization():
    assert normalize_address("1100 13th Avenue") == normalize_address("1100 13TH AVE.")
    assert normalize_address("6658 Zigler Road Suite 4") == "6658 ZIGLER RD"


def test_zip5():
    assert zip5("49301-1234") == "49301"
    assert zip5("") == ""


def test_same_name_and_zip_merge():
    ids = resolve([("1", "Sauder Woodworking Co", "502 Middle St", "43502"),
                   ("2", "SAUDER WOODWORKING COMPANY", "502 MIDDLE STREET", "43502-1111")])
    assert ids["1"] == ids["2"]


def test_same_name_different_zip_stays_separate():
    ids = resolve([("1", "Acme Fabrication", "1 Main St", "49301"),
                   ("2", "Acme Fabrication", "9 Oak St", "60601")])
    assert ids["1"] != ids["2"]


def test_renamed_company_at_same_address_merges():
    ids = resolve([("1", "Tootsie Roll Industries, Inc.", "7401 S. Cicero Ave.", "60629"),
                   ("2", "Tootsie Roll Mfg., LLC", "7401 S CICERO AVENUE", "60629")])
    assert ids["1"] == ids["2"]


def test_unrelated_tenants_at_same_address_stay_separate():
    ids = resolve([("1", "Great Lakes Cabinets", "100 Industrial Dr", "49301"),
                   ("2", "Precision Powder Coating", "100 Industrial Drive", "49301")])
    assert ids["1"] != ids["2"]


def test_names_similar():
    assert names_similar("XYLEM", "XYLEM WATER SOLUTIONS USA")
    assert not names_similar("GREAT LAKES CABINETS", "PRECISION POWDER COATING")
