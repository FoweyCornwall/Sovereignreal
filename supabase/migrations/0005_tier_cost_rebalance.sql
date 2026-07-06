-- Phase 2: raise tier 4/5 base costs so they're meaningfully out of reach
-- early-game (on top of the GDP-scaled multiplier introduced in 0004).
-- New target ranges: tier 4 ~6,000-15,000 (was 1,200-3,000),
-- tier 5 ~25,000-60,000 (was 4,000-9,000). Relative ordering within each
-- tier is preserved. Tunable - flagged in the Phase 2 plan as a placeholder
-- pending a playtesting pass.

update policy_library set base_cost = 11000 where key = 'econ_central_bank_reform_4';
update policy_library set base_cost = 14000 where key = 'social_universal_healthcare_4';
update policy_library set base_cost = 12000 where key = 'safety_national_guard_4';
update policy_library set base_cost = 13000 where key = 'innovation_research_university_4';
update policy_library set base_cost = 10000 where key = 'productivity_labor_reform_4';
update policy_library set base_cost = 11000 where key = 'infra_highway_expansion_4';
update policy_library set base_cost = 9000  where key = 'environment_carbon_tax_4';
update policy_library set base_cost = 8000  where key = 'immigration_points_system_4';
update policy_library set base_cost = 13500 where key = 'housing_public_housing_expansion_4';
update policy_library set base_cost = 7500  where key = 'culture_national_broadcasting_4';

update policy_library set base_cost = 52000 where key = 'econ_tax_haven_status_5';
update policy_library set base_cost = 48000 where key = 'social_welfare_overhaul_5';
update policy_library set base_cost = 40000 where key = 'safety_mega_surveillance_5';
update policy_library set base_cost = 58000 where key = 'innovation_moonshot_5';
update policy_library set base_cost = 36000 where key = 'infra_smart_city_hub_5';
update policy_library set base_cost = 44000 where key = 'environment_green_industrialisation_5';
update policy_library set base_cost = 44000 where key = 'housing_megaproject_5';
update policy_library set base_cost = 30000 where key = 'culture_golden_age_initiative_5';
