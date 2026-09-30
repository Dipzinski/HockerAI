-- Facility-level features for scoring.
-- Needs: facility_map (activity_nr -> facility_id) and standard_lookup, both built in Python,
-- and run_params (as_of, window_start, injury_start).

CREATE OR REPLACE TABLE facility_inspections AS
SELECT
    i.*,
    m.facility_id,
    d.programs AS dust_program
FROM inspections i
JOIN facility_map m USING (activity_nr)
LEFT JOIN (
    SELECT activity_nr, string_agg(program, '; ' ORDER BY program) AS programs
    FROM dust_programs GROUP BY 1
) d USING (activity_nr);

-- One row per facility. Name, location, industry, and headcount come from the most recent inspection.
CREATE OR REPLACE TABLE facilities AS
SELECT
    facility_id,
    arg_max(estab_name, open_date)                                   AS name,
    arg_max(site_address, open_date)                                 AS address,
    arg_max(site_city, open_date)                                    AS city,
    arg_max(site_state, open_date)                                   AS state,
    arg_max(zip5, open_date)                                         AS zip5,
    arg_max(naics_code, open_date)                                   AS naics,
    count(DISTINCT naics_code[1:3]) > 1                              AS naics_conflict,
    arg_max(employees, open_date) FILTER (WHERE employees IS NOT NULL) AS employees,
    count(DISTINCT estab_name)                                       AS name_variants,
    count(*)                                                         AS n_inspections,
    count(*) FILTER (WHERE open_date >= (SELECT window_start FROM run_params)) AS n_inspections_window,
    min(open_date)                                                   AS first_inspection,
    max(open_date)                                                   AS last_inspection
FROM facility_inspections
GROUP BY facility_id;

-- Evidence inside the scoring window: every citation, plus every inspection run
-- under a dust emphasis program. In a Combustible Dust NEP inspection, OSHA cites
-- dust explosion hazards under the General Duty Clause and hazard communication,
-- so those citations count as dust evidence there.
CREATE OR REPLACE TABLE evidence AS
SELECT
    fi.facility_id,
    v.activity_nr,
    'citation'                          AS kind,
    v.issuance_date                     AS evidence_date,
    v.citation_id,
    s.citation,
    s.title,
    CASE
        WHEN fi.dust_program LIKE '%Combustible Dust%'
         AND (s.title IN ('General Duty Clause', 'Michigan general duty clause')
              OR lower(s.title) LIKE '%hazard communication%')
        THEN 'dust'
        ELSE s.category
    END                                 AS category,
    v.viol_type,
    v.current_penalty,
    v.initial_penalty,
    v.contest_date,
    v.final_order_date,
    fi.dust_program,
    fi.open_date
FROM violations v
JOIN facility_inspections fi USING (activity_nr)
JOIN standard_lookup s USING (standard)
WHERE v.issuance_date >= (SELECT window_start FROM run_params)

UNION ALL

SELECT
    facility_id,
    activity_nr,
    'program_inspection',
    open_date,
    NULL, NULL,
    'Inspected under ' || dust_program,
    'adjacent',
    NULL, NULL, NULL, NULL, NULL,
    dust_program,
    open_date
FROM facility_inspections
WHERE dust_program IS NOT NULL
  AND open_date >= (SELECT window_start FROM run_params);

-- Conditions that block outreach until a person reviews the lead (v1's "Archive overrides score").
CREATE OR REPLACE TABLE holds AS
WITH fatal AS (
    SELECT fi.facility_id, max(coalesce(j.event_date, fi.open_date)) AS d
    FROM facility_inspections fi
    LEFT JOIN injuries j ON j.activity_nr = fi.activity_nr AND j.degree = 'fatality'
    WHERE (j.degree = 'fatality' AND j.event_date >= (SELECT window_start FROM run_params))
       OR (fi.insp_type = 'M' AND fi.open_date >= (SELECT window_start FROM run_params))
    GROUP BY 1
), injured AS (
    -- The accident tables lag by about 3 years, so accident-triggered inspections (type A) count too.
    SELECT fi.facility_id, max(coalesce(j.event_date, fi.open_date)) AS d
    FROM facility_inspections fi
    LEFT JOIN injuries j ON j.activity_nr = fi.activity_nr AND j.degree = 'hospitalized'
    WHERE (j.degree = 'hospitalized' AND j.event_date >= (SELECT injury_start FROM run_params))
       OR (fi.insp_type = 'A' AND fi.open_date >= (SELECT injury_start FROM run_params))
    GROUP BY 1
), contested AS (
    SELECT facility_id, max(contest_date) AS d
    FROM evidence
    WHERE kind = 'citation' AND contest_date IS NOT NULL AND final_order_date IS NULL
    GROUP BY 1
)
SELECT
    f.facility_id,
    fatal.d     AS fatality_date,
    injured.d   AS hospitalization_date,
    contested.d AS contested_date
FROM facilities f
LEFT JOIN fatal USING (facility_id)
LEFT JOIN injured USING (facility_id)
LEFT JOIN contested USING (facility_id);
