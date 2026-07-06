-- Policy library seed data: 50 cards, 10 per tier1 group scaled down through
-- tier5, spread across all 10 sectors. Tier bands (duration/cost/max single
-- delta) match lib/game/constants.ts TIER_DURATION_SECONDS / TIER_COST_RANGE /
-- TIER_MAX_SINGLE_DELTA - keep both in sync if these change.

insert into policy_library (key, title, description, tier, primary_sector, stat_deltas, base_cost, duration_seconds) values
-- Tier 1: 10-30s, cost 20-60, max |delta| 8
('econ_tax_reform_1', 'Minor Tax Reform', 'Small adjustments to tax brackets to stimulate spending.', 1, 'economy', '{"economy": 5.000, "productivity": -2.000}', 30, 20),
('econ_micro_loans_1', 'Microloan Program', 'Seed capital for small entrepreneurs.', 1, 'economy', '{"economy": 4.000, "social": 2.000}', 25, 15),
('social_public_holiday_1', 'Public Holiday Declaration', 'A new national holiday boosts morale.', 1, 'social', '{"social": 6.000, "productivity": -3.000}', 25, 15),
('social_community_center_1', 'Community Center Grants', 'Fund local community centers.', 1, 'social', '{"social": 5.000, "culture": 2.000}', 35, 20),
('safety_neighborhood_watch_1', 'Neighborhood Watch Program', 'Volunteer-led local safety initiative.', 1, 'safety', '{"safety": 5.000, "social": 1.000}', 30, 18),
('innovation_hackathon_1', 'National Hackathon', 'A public hackathon to surface new ideas.', 1, 'innovation', '{"innovation": 6.000, "economy": 1.000}', 40, 25),
('productivity_flex_hours_1', 'Flexible Work Hours Mandate', 'Employers must offer flexible scheduling.', 1, 'productivity', '{"productivity": 6.000, "social": -1.000}', 30, 20),
('infra_pothole_repair_1', 'Pothole Repair Blitz', 'Rapid local road maintenance campaign.', 1, 'infrastructure', '{"infrastructure": 5.000, "economy": 1.000}', 25, 15),
('environment_park_cleanup_1', 'City Park Cleanup Day', 'A coordinated public cleanup effort.', 1, 'environment', '{"environment": 6.000, "social": 1.000}', 20, 10),
('immigration_visa_streamline_1', 'Visa Application Streamlining', 'Cut red tape on visa processing.', 1, 'immigration', '{"immigration": 6.000, "economy": 1.000}', 35, 20),
('housing_rent_rebate_1', 'Temporary Rent Rebate', 'Short-term rebate for renters.', 1, 'housing', '{"housing": 5.000, "social": 2.000}', 40, 25),
('culture_arts_grant_1', 'Local Arts Grant', 'Fund local artists and performers.', 1, 'culture', '{"culture": 6.000, "social": 1.000}', 30, 20),

-- Tier 2: 2-10min, cost 100-300, max |delta| 14
('econ_smb_grants_2', 'Small Business Grant Fund', 'Grants targeted at small and medium businesses.', 2, 'economy', '{"economy": 10.000, "productivity": -3.000}', 180, 300),
('social_healthcare_subsidy_2', 'Healthcare Subsidy Expansion', 'Wider subsidies for basic healthcare.', 2, 'social', '{"social": 11.000, "economy": -2.000}', 220, 360),
('safety_police_training_2', 'Police Training Modernization', 'Modernized training standards nationwide.', 2, 'safety', '{"safety": 12.000, "social": 1.000}', 200, 300),
('innovation_startup_incubator_2', 'Startup Incubator Funding', 'Public-private incubator network.', 2, 'innovation', '{"innovation": 12.000, "economy": 3.000}', 250, 420),
('productivity_automation_pilot_2', 'Workplace Automation Pilot', 'Pilot automation subsidies for factories.', 2, 'productivity', '{"productivity": 12.000, "safety": -2.000}', 240, 360),
('infra_transit_upgrade_2', 'Public Transit Upgrade', 'Modernize buses and rail rolling stock.', 2, 'infrastructure', '{"infrastructure": 11.000, "environment": 2.000}', 260, 480),
('environment_recycling_program_2', 'Citywide Recycling Program', 'Mandatory recycling infrastructure.', 2, 'environment', '{"environment": 11.000, "economy": -1.000}', 150, 240),
('immigration_integration_2', 'Immigrant Integration Services', 'Language and job placement services.', 2, 'immigration', '{"immigration": 11.000, "social": 2.000}', 190, 300),
('housing_zoning_reform_2', 'Zoning Reform for Multi-Family Housing', 'Allow denser housing construction.', 2, 'housing', '{"housing": 12.000, "economy": 2.000}', 230, 360),
('culture_museum_funding_2', 'National Museum Funding', 'Expand public museum access.', 2, 'culture', '{"culture": 12.000, "innovation": 1.000}', 160, 240),

-- Tier 3: 10-60min, cost 400-900, max |delta| 20
('econ_free_trade_3', 'Free Trade Agreement', 'Open new trade corridors.', 3, 'economy', '{"economy": 16.000, "safety": -3.000}', 600, 1800),
('social_ubi_pilot_3', 'Universal Basic Income Pilot', 'Trial a basic income program.', 3, 'social', '{"social": 18.000, "productivity": -4.000}', 750, 2400),
('safety_border_patrol_3', 'Border Patrol Modernization', 'New equipment and staffing at the border.', 3, 'safety', '{"safety": 17.000, "immigration": -3.000}', 650, 1800),
('innovation_grant_program_3', 'National Innovation Grant Program', 'Large-scale R&D grants.', 3, 'innovation', '{"innovation": 15.000, "economy": 4.000, "productivity": -5.000}', 650, 2400),
('productivity_gov_digitization_3', 'Government Digitization Initiative', 'Digitize public services end to end.', 3, 'productivity', '{"productivity": 17.000, "innovation": 3.000}', 700, 2100),
('infra_broadband_rollout_3', 'Rural Broadband Rollout', 'Fiber buildout to underserved regions.', 3, 'infrastructure', '{"infrastructure": 18.000, "economy": 3.000}', 800, 3000),
('environment_green_energy_mandate_3', 'Green Energy Mandate', 'Require utilities to shift toward renewables.', 3, 'environment', '{"environment": 19.000, "economy": -3.000}', 850, 3300),
('immigration_refugee_resettlement_3', 'Refugee Resettlement Program', 'Structured resettlement support.', 3, 'immigration', '{"immigration": 17.000, "social": 3.000}', 550, 1500),
('housing_affordable_units_3', 'Affordable Housing Units Initiative', 'Publicly funded affordable unit construction.', 3, 'housing', '{"housing": 19.000, "economy": 2.000}', 780, 2700),
('culture_heritage_preservation_3', 'National Heritage Preservation Act', 'Protect and restore cultural landmarks.', 3, 'culture', '{"culture": 17.000, "environment": 1.000}', 500, 1800),

-- Tier 4: 2-12hr, cost 1200-3000, max |delta| 30
('econ_central_bank_reform_4', 'Central Bank Independence Reform', 'Insulate monetary policy from politics.', 4, 'economy', '{"economy": 26.000, "safety": -4.000}', 2200, 21600),
('social_universal_healthcare_4', 'Universal Healthcare Rollout', 'Nationwide universal healthcare coverage.', 4, 'social', '{"social": 28.000, "economy": -5.000}', 2800, 36000),
('safety_national_guard_4', 'National Guard Expansion', 'Expand emergency-response reserve forces.', 4, 'safety', '{"safety": 27.000, "economy": -4.000}', 2400, 25200),
('innovation_research_university_4', 'Elite Research University Funding', 'World-class research university endowment.', 4, 'innovation', '{"innovation": 28.000, "economy": 5.000}', 2600, 28800),
('productivity_labor_reform_4', 'Comprehensive Labor Law Reform', 'Modernize labor law nationwide.', 4, 'productivity', '{"productivity": 26.000, "social": -3.000}', 2000, 18000),
('infra_highway_expansion_4', 'National Highway Expansion', 'Major new interstate highway corridors.', 4, 'infrastructure', '{"infrastructure": 22.000, "environment": -6.000, "economy": 8.000}', 2200, 21600),
('environment_carbon_tax_4', 'National Carbon Tax', 'Broad-based carbon pricing.', 4, 'environment', '{"environment": 27.000, "economy": -6.000}', 1800, 14400),
('immigration_points_system_4', 'Skilled Migration Points System', 'Points-based skilled immigration reform.', 4, 'immigration', '{"immigration": 25.000, "innovation": 4.000}', 1600, 10800),
('housing_public_housing_expansion_4', 'Public Housing Expansion Program', 'Large-scale public housing construction.', 4, 'housing', '{"housing": 29.000, "economy": 3.000}', 2700, 32400),
('culture_national_broadcasting_4', 'National Broadcasting Network', 'State-funded public broadcasting network.', 4, 'culture', '{"culture": 26.000, "social": 3.000}', 1500, 10800),

-- Tier 5: 12hr-2days, cost 4000-9000, max |delta| 40
('econ_tax_haven_status_5', 'Tax Haven Status Legislation', 'Aggressive low-tax financial regime.', 5, 'economy', '{"economy": 38.000, "safety": -6.000}', 8000, 129600),
('social_welfare_overhaul_5', 'Total Welfare System Overhaul', 'Sweeping redesign of the welfare state.', 5, 'social', '{"social": 39.000, "economy": -8.000}', 7500, 108000),
('safety_mega_surveillance_5', 'Nationwide Surveillance Grid', 'Comprehensive public safety monitoring network.', 5, 'safety', '{"safety": 37.000, "social": -8.000}', 6500, 86400),
('innovation_moonshot_5', 'National Moonshot Research Initiative', 'A generational bet on frontier research.', 5, 'innovation', '{"innovation": 39.000, "economy": 6.000, "productivity": -8.000}', 9000, 172800),
('infra_smart_city_hub_5', 'Smart City Hub Network', 'Sensor-driven smart infrastructure nationwide.', 5, 'infrastructure', '{"infrastructure": 36.000, "innovation": 6.000, "environment": -4.000}', 6000, 72000),
('environment_green_industrialisation_5', 'Green Industrialisation Program', 'Retool heavy industry around clean tech.', 5, 'environment', '{"environment": 38.000, "economy": 8.000}', 7000, 100800),
('housing_megaproject_5', 'Nationwide Affordable Housing Mega-Project', 'A generational affordable housing program.', 5, 'housing', '{"housing": 35.000, "economy": 10.000, "environment": -8.000, "social": 6.000}', 7000, 129600),
('culture_golden_age_initiative_5', 'Golden Age Cultural Initiative', 'A sweeping investment in national culture.', 5, 'culture', '{"culture": 37.000, "social": 5.000, "innovation": 4.000}', 5500, 64800);
