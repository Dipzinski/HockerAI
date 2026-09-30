-- Typed, cleaned copies of the raw OSHA tables.
-- The raw tables are all text (the DOL files mix formats), so every cast is explicit.

-- Inspections of privately owned establishments (owner_type 'A'); public agencies aren't sales targets.
-- NR_IN_ESTAB should be the headcount at the inspected site, but some inspectors entered the
-- company-wide total (e.g. 150,000 at one meat plant). Values of 5,000 or more are cleared.
CREATE OR REPLACE TABLE inspections AS
SELECT
    CAST(activity_nr AS BIGINT)                          AS activity_nr,
    trim(estab_name)                                     AS estab_name,
    trim(site_address)                                   AS site_address,
    trim(site_city)                                      AS site_city,
    site_state,
    NULLIF(lpad(regexp_replace(coalesce(site_zip, ''), '[^0-9]', '', 'g'), 5, '0')[1:5], '00000') AS zip5,
    naics_code,
    TRY_CAST(nr_in_estab AS INTEGER)                     AS employees_reported,
    CASE WHEN TRY_CAST(nr_in_estab AS INTEGER) BETWEEN 1 AND 4999
         THEN TRY_CAST(nr_in_estab AS INTEGER) END       AS employees,
    insp_type,
    CAST(open_date[1:10] AS DATE)                        AS open_date,
    TRY_CAST(close_case_date[1:10] AS DATE)              AS close_case_date
FROM raw_inspection
WHERE owner_type = 'A';

-- Citations. DELETE_FLAG = 'X' marks citations OSHA withdrew, so they are dropped.
CREATE OR REPLACE TABLE violations AS
SELECT
    CAST(activity_nr AS BIGINT)                          AS activity_nr,
    citation_id,
    trim(standard)                                       AS standard,
    viol_type,                                           -- S serious, W willful, R repeat, O other
    CAST(issuance_date[1:10] AS DATE)                    AS issuance_date,
    TRY_CAST(current_penalty AS DOUBLE)                  AS current_penalty,
    TRY_CAST(initial_penalty AS DOUBLE)                  AS initial_penalty,
    TRY_CAST(contest_date[1:10] AS DATE)                 AS contest_date,
    TRY_CAST(final_order_date[1:10] AS DATE)             AS final_order_date
FROM raw_violation
WHERE delete_flag IS NULL
  AND CAST(activity_nr AS BIGINT) IN (SELECT activity_nr FROM inspections);

-- Inspections run under a dust-related emphasis program: OSHA's Combustible Dust
-- National Emphasis Program (DUSTEXPL) or a silica program (national, state, or local).
CREATE OR REPLACE TABLE dust_programs AS
SELECT DISTINCT
    CAST(activity_nr AS BIGINT)                          AS activity_nr,
    CASE WHEN upper(prog_value) = 'DUSTEXPL' THEN 'Combustible Dust NEP' ELSE 'Silica emphasis program' END AS program
FROM raw_emphasis_codes
WHERE upper(prog_value) IN ('DUSTEXPL', 'SILICA', 'SILICA EXPOSURE')
  AND CAST(activity_nr AS BIGINT) IN (SELECT activity_nr FROM inspections);

-- Fatalities and hospitalizations tied to an inspection (used only for holds, never shown in outreach).
CREATE OR REPLACE TABLE injuries AS
SELECT
    CAST(i.rel_insp_nr AS BIGINT)                        AS activity_nr,
    CAST(a.event_date[1:10] AS DATE)                     AS event_date,
    CASE TRY_CAST(i.degree_of_inj AS DOUBLE)
        WHEN 1 THEN 'fatality' WHEN 2 THEN 'hospitalized' ELSE 'other' END AS degree
FROM raw_accident_injury i
JOIN raw_accident a USING (summary_nr)
WHERE CAST(i.rel_insp_nr AS BIGINT) IN (SELECT activity_nr FROM inspections);
