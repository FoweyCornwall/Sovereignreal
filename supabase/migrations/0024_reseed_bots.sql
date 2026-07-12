-- Pure-SQL equivalent of `npm run seed:bots` (scripts/seed-bots.ts), for
-- pasting directly into the Supabase SQL Editor - no local terminal/Node
-- needed. Wipes every existing bot row and reseeds the full pool so old
-- sub-Diamond bot rows (seeded before the Diamond floor existed) can't
-- linger on the leaderboard. Safe to re-run any time - it always starts by
-- deleting all bot rows, so re-running just rerolls the whole bot pool.
--
-- Mirrors scripts/seed-bots.ts exactly: 120 VISIBLE bots (show_on_leaderboard
-- = true, floored at Diamond GDP so the leaderboard is genuinely "100+
-- players, all Diamond or higher") + 150 HIDDEN bots (show_on_leaderboard =
-- false, full Bronze-Diamond spread, matchmaking fodder only). ~25% of bots
-- in both pools get a joke custom country + funny username instead of a
-- real one.

do $$
declare
  v_country_names text[] := array['Afghanistan','Algeria','Angola','Argentina','Australia','Austria','Bangladesh','Belarus','Belgium','Bolivia','Brazil','Bulgaria','Cambodia','Cameroon','Canada','Chile','China','Colombia','Costa Rica','Croatia','Cuba','Cyprus','Czechia','Denmark','Dominican Republic','Ecuador','Egypt','El Salvador','Estonia','Ethiopia','Fiji','Finland','France','Georgia','Germany','Ghana','Greece','Guatemala','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Latvia','Lebanon','Lithuania','Luxembourg','Malaysia','Malta','Mexico','Moldova','Mongolia','Morocco','Myanmar','Nepal','Netherlands','New Zealand','Nigeria','Norway','Pakistan','Panama','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia','Saudi Arabia','Senegal','Serbia','Singapore','Slovakia','Slovenia','South Africa','South Korea','Spain','Sri Lanka','Sweden','Switzerland','Taiwan','Tanzania','Thailand','Tunisia','Turkey','Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Venezuela','Vietnam','Zambia','Zimbabwe'];
  v_iso_codes text[] := array['AF','DZ','AO','AR','AU','AT','BD','BY','BE','BO','BR','BG','KH','CM','CA','CL','CN','CO','CR','HR','CU','CY','CZ','DK','DO','EC','EG','SV','EE','ET','FJ','FI','FR','GE','DE','GH','GR','GT','HN','HU','IS','IN','ID','IR','IQ','IE','IL','IT','JM','JP','JO','KZ','KE','KW','LV','LB','LT','LU','MY','MT','MX','MD','MN','MA','MM','NP','NL','NZ','NG','NO','PK','PA','PE','PH','PL','PT','QA','RO','RU','SA','SN','RS','SG','SK','SI','ZA','KR','ES','LK','SE','CH','TW','TZ','TH','TN','TR','UG','UA','AE','GB','US','UY','VE','VN','ZM','ZW'];
  v_flags text[] := array['🇦🇫','🇩🇿','🇦🇴','🇦🇷','🇦🇺','🇦🇹','🇧🇩','🇧🇾','🇧🇪','🇧🇴','🇧🇷','🇧🇬','🇰🇭','🇨🇲','🇨🇦','🇨🇱','🇨🇳','🇨🇴','🇨🇷','🇭🇷','🇨🇺','🇨🇾','🇨🇿','🇩🇰','🇩🇴','🇪🇨','🇪🇬','🇸🇻','🇪🇪','🇪🇹','🇫🇯','🇫🇮','🇫🇷','🇬🇪','🇩🇪','🇬🇭','🇬🇷','🇬🇹','🇭🇳','🇭🇺','🇮🇸','🇮🇳','🇮🇩','🇮🇷','🇮🇶','🇮🇪','🇮🇱','🇮🇹','🇯🇲','🇯🇵','🇯🇴','🇰🇿','🇰🇪','🇰🇼','🇱🇻','🇱🇧','🇱🇹','🇱🇺','🇲🇾','🇲🇹','🇲🇽','🇲🇩','🇲🇳','🇲🇦','🇲🇲','🇳🇵','🇳🇱','🇳🇿','🇳🇬','🇳🇴','🇵🇰','🇵🇦','🇵🇪','🇵🇭','🇵🇱','🇵🇹','🇶🇦','🇷🇴','🇷🇺','🇸🇦','🇸🇳','🇷🇸','🇸🇬','🇸🇰','🇸🇮','🇿🇦','🇰🇷','🇪🇸','🇱🇰','🇸🇪','🇨🇭','🇹🇼','🇹🇿','🇹🇭','🇹🇳','🇹🇷','🇺🇬','🇺🇦','🇦🇪','🇬🇧','🇺🇸','🇺🇾','🇻🇪','🇻🇳','🇿🇲','🇿🇼'];

  v_custom_names text[] := array['The United Snack Nations','Republic of Nap Time','Duchy of Bad Wifi','Sock Drawer Federation','Land of Perpetual Mondays','Kingdom of Overdue Library Books','Republic of Lost Chargers','Duchy of Cold Coffee','Nation of Almost Vegetarians','Land of the Midnight Snack','Federation of Procrastination','Kingdom of Mismatched Socks','Republic of Group Chat Silence','Duchy of Autocorrect Fails','Nation of Loading Screens','Land of Forgotten Passwords','Kingdom of Backseat Drivers','Republic of Half-Finished Projects','Federation of Snooze Buttons','Duchy of Wrong Turn Avenue','People''s Republic of Left Socks','Grand Duchy of Expired Coupons','Nation of Unread Emails','Kingdom of Low Battery','Republic of Buffering'];
  v_custom_flags text[] := array['🏴','🚩','🎌','⭐','🌟','🔶','🔷','🔺','⚜️','🦅','🦁','🐉','⚓','🗼','🌊','🍕','🧦','☕','🐢','🦆'];
  v_custom_colors text[] := array['#1e3a8a','#991b1b','#166534','#78350f','#581c87','#0f172a','#b91c1c','#065f46','#92400e','#312e81'];

  v_handle_a text[] := array['alex','sam','jordan','riley','casey','avery','morgan','taylor','quinn','reese','kai','leo','milo','arlo','juno','nova','sage','wren','eli','finn','mira','iris','cal','ren','noor','sol','yuki','aki','tomo','yuri','dima','kira','luca','theo','ivo','nils','lena','anya','elin','maya','zara','aria','iona','mateo','dax','jax','ash','rue','cora','ezra'];
  v_handle_b text[] := array['','','','','','wave','sky','star','moon','sun','river','storm','rain','vale','peak','glass','iron','pine','oak','reed','haze'];
  v_separators text[] := array['','','','','_','.','-'];
  v_funny_names text[] := array['potato_overlord','chaosgremlin','npc_energy','wifi_thief','professional_napper','just_here_for_snacks','certified_disaster','big_mood_energy','send_help_pls','not_a_bot_i_promise','goblin_mode_on','existential_dread','chronically_online','mildly_feral','gremlin_supreme','snack_diplomat','couch_general','wifi_password_thief','tuesday_enjoyer','unpaid_intern','reply_all_villain','certified_menace','houseplant_killer','lost_the_remote','pretends_to_work'];

  v_visible_count int := 120;
  v_hidden_count int := 150;
  v_custom_chance numeric := 0.25;

  i int;
  v_roll numeric;
  v_min numeric;
  v_max numeric;
  v_vip_chance numeric;
  v_gdp numeric;
  v_is_custom boolean;
  v_name text;
  v_username text;
  v_flag_emoji text;
  v_flag_style jsonb;
  v_country_code text;
  v_pool_idx int;
  v_num_roll numeric;
  v_suffix text;
  v_b_part text;
begin
  delete from countries where is_bot = true;

  -- VISIBLE pool: Diamond / Master / Grandmaster, weighted 0.45/0.40/0.15.
  for i in 1..v_visible_count loop
    v_roll := random();
    if v_roll <= 0.45 then
      v_min := 100000000000; v_max := 1000000000000; v_vip_chance := 0.2;
    elsif v_roll <= 0.85 then
      v_min := 1000000000000; v_max := 10000000000000; v_vip_chance := 0.4;
    else
      v_min := 10000000000000; v_max := 300000000000000; v_vip_chance := 0.65;
    end if;
    v_gdp := v_min + random() * (v_max - v_min);
    v_is_custom := random() < v_custom_chance;

    if v_is_custom then
      v_name := v_custom_names[1 + floor(random() * array_length(v_custom_names, 1))::int];
      v_flag_emoji := v_custom_flags[1 + floor(random() * array_length(v_custom_flags, 1))::int];
      v_flag_style := jsonb_build_object('bg', v_custom_colors[1 + floor(random() * array_length(v_custom_colors, 1))::int]);
      v_country_code := null;
      v_suffix := case when random() < 0.3 then (1 + floor(random() * 99))::text else '' end;
      v_username := v_funny_names[1 + floor(random() * array_length(v_funny_names, 1))::int] || v_suffix;
    else
      v_pool_idx := 1 + floor(random() * array_length(v_country_names, 1))::int;
      v_name := v_country_names[v_pool_idx];
      v_flag_emoji := v_flags[v_pool_idx];
      v_flag_style := null;
      v_country_code := v_iso_codes[v_pool_idx];
      v_num_roll := random();
      v_suffix := case
        when v_num_roll < 0.35 then (1 + floor(random() * 99))::text
        when v_num_roll < 0.55 then (1000 + floor(random() * 9000))::text
        else ''
      end;
      v_b_part := v_handle_b[1 + floor(random() * array_length(v_handle_b, 1))::int];
      v_username := v_handle_a[1 + floor(random() * array_length(v_handle_a, 1))::int]
        || (case when v_b_part <> '' then
              v_separators[1 + floor(random() * array_length(v_separators, 1))::int] || v_b_part
            else '' end)
        || v_suffix;
    end if;

    insert into countries (
      user_id, is_bot, show_on_leaderboard, name, username, flag_emoji, flag_style,
      country_code, gdp, gdp_per_sec, treasury, treasury_regen_per_sec, is_vip_bot
    ) values (
      null, true, true, v_name, v_username, v_flag_emoji, v_flag_style,
      v_country_code, round(v_gdp::numeric, 3), 0, 0, 0, random() < v_vip_chance
    );
  end loop;

  -- HIDDEN pool: Bronze through Diamond, weighted toward weaker/mid.
  for i in 1..v_hidden_count loop
    v_roll := random();
    if v_roll <= 0.3 then
      v_min := 0; v_max := 100000000; v_vip_chance := 0.05;
    elsif v_roll <= 0.55 then
      v_min := 100000000; v_max := 1000000000; v_vip_chance := 0.05;
    elsif v_roll <= 0.75 then
      v_min := 1000000000; v_max := 10000000000; v_vip_chance := 0.05;
    elsif v_roll <= 0.9 then
      v_min := 10000000000; v_max := 100000000000; v_vip_chance := 0.1;
    else
      v_min := 100000000000; v_max := 1000000000000; v_vip_chance := 0.1;
    end if;
    v_gdp := v_min + random() * (v_max - v_min);
    v_is_custom := random() < v_custom_chance;

    if v_is_custom then
      v_name := v_custom_names[1 + floor(random() * array_length(v_custom_names, 1))::int];
      v_flag_emoji := v_custom_flags[1 + floor(random() * array_length(v_custom_flags, 1))::int];
      v_flag_style := jsonb_build_object('bg', v_custom_colors[1 + floor(random() * array_length(v_custom_colors, 1))::int]);
      v_country_code := null;
      v_suffix := case when random() < 0.3 then (1 + floor(random() * 99))::text else '' end;
      v_username := v_funny_names[1 + floor(random() * array_length(v_funny_names, 1))::int] || v_suffix;
    else
      v_pool_idx := 1 + floor(random() * array_length(v_country_names, 1))::int;
      v_name := v_country_names[v_pool_idx];
      v_flag_emoji := v_flags[v_pool_idx];
      v_flag_style := null;
      v_country_code := v_iso_codes[v_pool_idx];
      v_num_roll := random();
      v_suffix := case
        when v_num_roll < 0.35 then (1 + floor(random() * 99))::text
        when v_num_roll < 0.55 then (1000 + floor(random() * 9000))::text
        else ''
      end;
      v_b_part := v_handle_b[1 + floor(random() * array_length(v_handle_b, 1))::int];
      v_username := v_handle_a[1 + floor(random() * array_length(v_handle_a, 1))::int]
        || (case when v_b_part <> '' then
              v_separators[1 + floor(random() * array_length(v_separators, 1))::int] || v_b_part
            else '' end)
        || v_suffix;
    end if;

    insert into countries (
      user_id, is_bot, show_on_leaderboard, name, username, flag_emoji, flag_style,
      country_code, gdp, gdp_per_sec, treasury, treasury_regen_per_sec, is_vip_bot
    ) values (
      null, true, false, v_name, v_username, v_flag_emoji, v_flag_style,
      v_country_code, round(v_gdp::numeric, 3), 0, 0, 0, random() < v_vip_chance
    );
  end loop;
end $$;
