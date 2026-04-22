import { MODULE_ID } from "./config.mjs";

/* ================================================================
 *  Helpers
 * ================================================================ */

function loc(key) { return game.i18n.localize(key); }

function modifier(val) {
  const n = Number(val);
  return n >= 0 ? `+${n}` : `${n}`;
}

/** Build a single action entry for an ability item. */
function abilityEntry(item) {
  const res = item.system.resource;
  const cost = (res && res !== 0) ? `${res}` : "";
  const cat = item.system.category ?? "";
  let emoji = "fa-solid fa-diamond";
  if (cat === "signature") emoji = "fa-solid fa-star-of-life";
  else if (cat === "heroic") emoji = "fa-solid fa-star";
  else if (cat === "epic") emoji = "fa-solid fa-gem";
  else if (cat === "freeStrike") emoji = "fa-solid fa-sword";
  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img,
    cost,
    emoji,
    actionType: "ability",
    actionId: item.id,
  };
}

/** Build a single action entry for a feature/treasure item (print to chat). */
function featureEntry(item, emoji = "fa-solid fa-scroll") {
  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img,
    cost: "",
    emoji,
    actionType: "feature",
    actionId: item.id,
  };
}

/** Characteristic button entry. */
function charEntry(name, value) {
  const icons = { might: "fa-solid fa-fist-raised", agility: "fa-solid fa-feather", reason: "fa-solid fa-brain", intuition: "fa-solid fa-eye", presence: "fa-solid fa-user-crown" };
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  return {
    id: `char-${name}`,
    name: displayName,
    img: null,
    cost: modifier(value),
    emoji: icons[name] ?? "fa-solid fa-dice",
    actionType: "characteristic",
    actionId: name,
  };
}

/** Simple static action entry. */
function staticEntry(id, name, emoji, actionType, cost = "") {
  return { id, name, img: null, cost, emoji, actionType, actionId: id };
}

/* ================================================================
 *  Generic Abilities from Compendium
 * ================================================================ */

/** Get the set of _dsid values from the Basic Abilities compendium folder. */
let _basicAbilityDsids = null;
async function getBasicAbilityDsids() {
  if (_basicAbilityDsids) return _basicAbilityDsids;
  _basicAbilityDsids = new Set();
  const pack = game.packs.get("draw-steel.abilities");
  if (!pack) return _basicAbilityDsids;
  const folders = pack.folders ?? [];
  const basicFolder = folders.find(f => f.name === "Basic Abilities")
    ?? folders.find(f => f.name === "Basic Actions");
  if (!basicFolder) return _basicAbilityDsids;
  const index = await pack.getIndex({ fields: ["system._dsid", "folder"] });
  for (const entry of index) {
    if (entry.folder !== basicFolder.id) continue;
    if (entry.system?._dsid) {
      _basicAbilityDsids.add(entry.system._dsid);
    }
  }
  return _basicAbilityDsids;
}

/** Get the configured basic ability UUIDs for this actor, filtered by GM settings. */
async function getGenericAbilities(actor, abilityType) {
  const config = game.settings.get(MODULE_ID, "genericAbilitiesConfig") ?? {};

  // Determine which column to check: use the actor's non-GM owner, not the current viewer
  let column;
  if (actor.type === "hero") {
    const owner = game.users.find(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
    column = owner?.id ?? game.user.id;
  } else if (actor.type === "retainer") {
    column = "__retainers__";
  } else {
    column = "__monsters__";
  }

  const pack = game.packs.get("draw-steel.abilities");
  if (!pack) return [];

  const folders = pack.folders ?? [];
  const basicFolder = folders.find(f => f.name === "Basic Abilities")
    ?? folders.find(f => f.name === "Basic Actions");
  if (!basicFolder) return [];

  const index = await pack.getIndex({ fields: ["system.type", "system._dsid", "folder", "name", "img", "system.resource", "system.category"] });
  // Compendium uses "action" for main-action type entries; map "main" → ["main", "action"]
  const requested = abilityType
    ? (Array.isArray(abilityType) ? abilityType : [abilityType])
    : null;
  const allowedTypes = requested
    ? requested.flatMap(t => t === "main" ? ["main", "action"] : [t])
    : null;

  const results = [];
  for (const entry of index) {
    if (entry.folder !== basicFolder.id) continue;
    if (allowedTypes && !allowedTypes.includes(entry.system?.type)) continue;
    if (entry.system?.category === "freeStrike") continue;

    const uuid = `Compendium.draw-steel.abilities.Item.${entry._id}`;
    const abilityConfig = config[uuid];
    if (abilityConfig && abilityConfig[column] === false) continue;

    results.push({
      id: `generic-${entry._id}`,
      _dsid: entry.system?._dsid ?? null,
      uuid,
      name: entry.name,
      img: entry.img,
      cost: (entry.system?.resource && entry.system.resource !== 0) ? `${entry.system.resource}` : "",
      emoji: "fa-solid fa-gears",
      actionType: "compendiumAbility",
      actionId: uuid,
    });
  }
  return results;
}

/* ================================================================
 *  Homebrew Maneuvers
 * ================================================================ */

async function getHomebrewManeuvers() {
  const uuids = game.settings.get(MODULE_ID, "homebrewManeuvers") ?? [];
  const results = [];
  for (const uuid of uuids) {
    try {
      const item = await fromUuid(uuid);
      if (!item) continue;
      results.push({
        id: `homebrew-${item.id}`,
        uuid,
        name: item.name,
        img: item.img,
        cost: (item.system?.resource && item.system.resource !== 0) ? `${item.system.resource}` : "",
        emoji: "fa-solid fa-wrench",
        actionType: "compendiumAbility",
        actionId: uuid,
      });
    } catch { /* skip invalid UUIDs */ }
  }
  return results;
}

/* ================================================================
 *  Button 1: Main Action
 * ================================================================ */

export async function buildMainActionData(actor) {
  const sections = [];
  const items = actor.items;
  const isNpc = actor.type === "npc";
  const isRetainer = actor.type === "retainer";

  const basicDsids = await getBasicAbilityDsids();

  // Signature abilities
  const signature = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "main") continue;
    if (item.system._dsid && basicDsids.has(item.system._dsid)) continue;
    if (item.system.category === "signature") signature.push(abilityEntry(item));
  }

  // Heroic abilities (main action type) — labelled "Malice" for NPCs
  const heroic = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "main") continue;
    if (item.system._dsid && basicDsids.has(item.system._dsid)) continue;
    if (item.system.category === "heroic" || item.system.category === "epic") heroic.push(abilityEntry(item));
  }

  // Uncategorized main actions — treat like signature if free, heroic/malice if it has a cost
  const knownCategories = new Set(["signature", "heroic", "epic", "freeStrike"]);
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "main") continue;
    if (item.system._dsid && basicDsids.has(item.system._dsid)) continue;
    if (knownCategories.has(item.system.category)) continue;
    if (item.system.resource) {
      heroic.push(abilityEntry(item));
    } else {
      signature.push(abilityEntry(item));
    }
  }

  if (signature.length) sections.push({ title: loc("DSAHUD.Sections.Signature"), items: signature });
  heroic.sort((a, b) => ((Number(a.cost) || 0) - (Number(b.cost) || 0)) || a.name.localeCompare(b.name));
  if (heroic.length) sections.push({ title: loc(isNpc ? "DSAHUD.Sections.Malice" : "DSAHUD.Sections.Heroic"), items: heroic });

  // Free Strikes (ability items with freeStrike category)
  const freeStrikes = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.category !== "freeStrike") continue;
    freeStrikes.push(abilityEntry(item));
  }
  if (freeStrikes.length) sections.push({ title: loc("DSAHUD.Sections.FreeStrikes"), items: freeStrikes });

  // NPC / Retainer Free Strike button (system-level, uses actor.system.performFreeStrike)
  if (isNpc || isRetainer) {
    const fs = actor.system.freeStrike;
    const dmg = fs?.value ?? actor.system.monster?.freeStrike ?? actor.system.retainer?.freeStrike ?? "?";
    sections.push({
      title: loc("DSAHUD.Sections.FreeStrike"),
      items: [staticEntry("npc-free-strike", loc("DSAHUD.Sections.FreeStrike"), "fa-solid fa-sword", "npcFreeStrike", `${dmg}`)],    });
  }

  // Basic Abilities — include actor-owned basics plus generic compendium basics
  const basicActorItems = [];
  const basicActorDsids = new Set();
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "main") continue;
    if (item.system.category === "freeStrike") continue;
    if (!item.system._dsid || !basicDsids.has(item.system._dsid)) continue;
    basicActorDsids.add(item.system._dsid);
    basicActorItems.push(abilityEntry(item));
  }

  const basicCompendium = await getGenericAbilities(actor, "main");
  const basicExtra = basicCompendium.filter(e => !basicActorDsids.has(e._dsid));
  const basic = [...basicActorItems, ...basicExtra];
  if (basic.length) sections.push({ title: loc("DSAHUD.Sections.BasicAbilities"), items: basic });

  return sections;
}

/* ================================================================
 *  Button 2: Maneuver
 * ================================================================ */

export async function buildManeuverData(actor) {
  const sections = [];
  const items = actor.items;

  // Special Maneuver (actor's own maneuver abilities, excluding basic ones)
  const basicDsids = await getBasicAbilityDsids();
  const special = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "maneuver") continue;
    if (item.system._dsid && basicDsids.has(item.system._dsid)) continue;
    special.push(abilityEntry(item));
  }
  if (special.length) sections.push({ title: loc("DSAHUD.Sections.SpecialManeuver"), items: special });

  // Free Maneuver
  const freeManeuver = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "freeManeuver") continue;
    freeManeuver.push(abilityEntry(item));
  }
  if (freeManeuver.length) sections.push({ title: loc("DSAHUD.Sections.FreeManeuver"), items: freeManeuver });

  // Basic Maneuver (from compendium)
  const basic = await getGenericAbilities(actor, "maneuver");
  if (basic.length) sections.push({ title: loc("DSAHUD.Sections.BasicManeuver"), items: basic });

  // Homebrew Maneuvers
  const homebrew = await getHomebrewManeuvers();
  if (homebrew.length) sections.push({ title: loc("DSAHUD.Sections.HomebrewManeuver"), items: homebrew });

  return sections;
}

/* ================================================================
 *  Button 3: Triggered Action
 * ================================================================ */

export async function buildTriggeredData(actor) {
  const sections = [];
  const items = actor.items;

  // Triggered Action
  const triggered = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "triggered") continue;
    triggered.push(abilityEntry(item));
  }
  if (triggered.length) sections.push({ title: loc("DSAHUD.Sections.TriggeredAction"), items: triggered });

  // Free Triggered Action
  const freeTriggered = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "freeTriggered") continue;
    freeTriggered.push(abilityEntry(item));
  }
  if (freeTriggered.length) sections.push({ title: loc("DSAHUD.Sections.FreeTriggeredAction"), items: freeTriggered });

  return sections;
}

/* ================================================================
 *  Button: No Action
 * ================================================================ */

export async function buildNoActionData(actor) {
  const sections = [];
  const noAction = [];
  for (const item of actor.items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "none") continue;
    noAction.push(abilityEntry(item));
  }
  if (noAction.length) sections.push({ title: loc("DSAHUD.Sections.NoAction"), items: noAction });
  return sections;
}

/* ================================================================
 *  Button 4: Character
 * ================================================================ */

export async function buildCharacterData(actor) {
  const sections = [];
  const isHero = actor.type === "hero";
  const isRetainer = actor.type === "retainer";

  // Ability Tests
  const chars = actor.system.characteristics ?? {};
  const charItems = [];
  for (const [name, data] of Object.entries(chars)) {
    charItems.push(charEntry(name, data.value));
  }
  if (charItems.length) sections.push({ title: loc("DSAHUD.Sections.AbilityTest"), items: charItems });

  // Recovery
  if (isHero || isRetainer) {
    const rec = actor.system.recoveries;
    sections.push({
      title: loc("DSAHUD.Sections.Recovery"),
      items: [staticEntry("recovery", loc("DSAHUD.Actions.SpendRecovery"), "fa-solid fa-heart-pulse", "recovery", `${rec?.value ?? 0}/${rec?.max ?? 0}`)],    });
  }

  if (isHero) {
    // Hero Tokens
    const heroTokens = game.actors?.heroTokens?.value ?? 0;
    sections.push({
      title: loc("DSAHUD.Sections.HeroTokens"),
      items: [
        staticEntry("heroTokenRecovery", loc("DSAHUD.Actions.HeroTokenRecovery"), "fa-solid fa-coin", "heroTokenRecovery", `${heroTokens} tokens`),
        staticEntry("gainSurges", loc("DSAHUD.Actions.GainSurges"), "fa-solid fa-bolt", "gainSurges", `1 token`),
      ],
    });

  }

  // Spend Surge (heroes and retainers can spend)
  if (isHero || isRetainer) {
    sections.push({
      title: loc("DSAHUD.Sections.SpendSurge"),
      items: [
        staticEntry("damageSurge1", loc("DSAHUD.Actions.DamageSurge1"), "fa-solid fa-burst", "damageSurge", `1 surge`),
        staticEntry("damageSurge2", loc("DSAHUD.Actions.DamageSurge2"), "fa-solid fa-burst", "damageSurge2", `2 surges`),
        staticEntry("damageSurge3", loc("DSAHUD.Actions.DamageSurge3"), "fa-solid fa-burst", "damageSurge3", `3 surges`),
        staticEntry("potencySurge", loc("DSAHUD.Actions.PotencySurge"), "fa-solid fa-arrow-up", "potencySurge", `2 surges`),
      ],
    });
  }

  // ---- Character panel (left column; hero/retainer) ----
  let charPanel = null;

  if ((isHero || isRetainer) && game.settings.get(MODULE_ID, "showCharPanel")) {
    const staminaMax = actor.system.stamina.max ?? 0;
    const staminaVal = actor.system.stamina.value ?? 0;
    const staminaTemp = actor.system.stamina.temporary ?? 0;

    // Bar range: -50% max to +100% max, normalized to 0–100% width.
    // fillPos = where current stamina sits in that range (0% = minStamina, 100% = max).
    // Bar always fills from the left edge to fillPos.
    // zeroPercent = where value=0 sits (the white marker line), always ~33%.
    const usesHeroDeathRange = isHero || isRetainer;
    const minStamina = usesHeroDeathRange ? (staminaMax > 0 ? Math.floor(-staminaMax * 0.5) : -10) : 0;
    const totalRange = staminaMax - minStamina;
    const zeroPercent = usesHeroDeathRange
      ? (totalRange > 0 ? ((0 - minStamina) / totalRange * 100) : 33.33)
      : null;

    const clampedVal = Math.max(minStamina, Math.min(staminaMax, staminaVal));
    const fillPos = totalRange > 0 ? ((clampedVal - minStamina) / totalRange * 100) : 0;

    // Color based on ratio of current stamina to max (0 = red, 1 = green)
    const ratio = staminaMax > 0 ? Math.max(0, Math.min(1, clampedVal / staminaMax)) : 0;
    const hue = Math.round(ratio * 120);
    const fillColor = `hsl(${hue}, 75%, 42%)`;

    // Fill always left→right from position 0
    const mainFillLeft = 0;
    const mainFillWidth = Math.max(0, fillPos);

    // Temp stamina bar
    let tempLeft = null, tempWidth = null;
    if (staminaTemp > 0 && totalRange > 0) {
      const fillEndPos = ((Math.min(staminaVal, staminaMax) - minStamina) / totalRange * 100);
      tempLeft = fillEndPos.toFixed(2);
      tempWidth = (staminaTemp / totalRange * 100).toFixed(2);
    }

    const staminaLabel = `${staminaVal} / ${staminaMax}${staminaTemp > 0 ? ` (${staminaTemp})` : ""}`;

    // Recoveries
    const rec = actor.system.recoveries;
    const recoveryValue = rec?.recoveryValue ?? Math.floor((staminaMax) / 3);

    // Hero-only resource; surges (heroes use own, retainers use mentor's)
    const classItem = isHero ? actor.items.find(i => i.type === "class") : null;
    const heroicResourceName = classItem?.system?.primary ?? "Heroic Resource";
    const heroicResourceValue = isHero ? (actor.system.hero?.primary?.value ?? 0) : null;
    const mentor = isRetainer ? actor.system.retainer?.mentor : null;
    const surgesCount = isHero
      ? (actor.system.hero?.surges ?? 0)
      : (isRetainer ? (mentor?.system?.hero?.surges ?? 0) : null);

    // Size
    const combatSize = actor.system.combat?.size ?? {};
    const sizeVal = combatSize.value ?? 1;
    const sizeLetter = combatSize.letter ?? "M";
    const sizeDisplay = sizeVal === 1 ? `1${sizeLetter}` : `${sizeVal}`;

    // Stability
    const stability = actor.system.combat?.stability ?? 0;

    // Movement
    const mov = actor.system.movement ?? {};
    const movSpeed = mov.value ?? 5;
    const movTypes = Array.from(mov.types ?? []);
    const movDisplay = movTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(", ") || "Walk";
    const movDisengage = mov.disengage ?? 1;

    // Skills (hero only)
    const skillSet = isHero ? (actor.system.skills?.value ?? []) : [];
    const skillList = Array.from(skillSet)
      .map(key => globalThis.ds?.CONFIG?.skills?.list?.[key]?.label ?? (key.charAt(0).toUpperCase() + key.slice(1)))
      .sort();

    charPanel = {
      name: actor.name,
      mentor: (isRetainer && mentor) ? { name: mentor.name } : null,
      stamina: {
        label: staminaLabel,
        fillLeft:    mainFillLeft.toFixed(2),
        fillWidth:   mainFillWidth.toFixed(2),
        fillColor,
        zeroPercent: zeroPercent !== null ? zeroPercent.toFixed(2) : null,
        tempLeft,
        tempWidth,
      },
      recoveries: {
        value:         rec?.value ?? 0,
        max:           rec?.max ?? 0,
        recoveryValue,
      },
      surges: surgesCount,
      showSurges: surgesCount !== null,
      heroicResource: isHero ? { name: heroicResourceName, value: heroicResourceValue } : null,
      size: sizeDisplay,
      stability,
      movement: { speed: movSpeed, display: movDisplay, disengage: movDisengage },
      skills: isHero ? skillList : null,
    };
  }

  // Conditions — built independently of charPanel setting
  let conditions = null;
  if (game.settings.get(MODULE_ID, "showConditionsPanel")) {
    const activeStatuses = actor.statuses ?? new Set();
    const DS_CONDITIONS = ["bleeding", "dazed", "frightened", "grabbed", "prone", "restrained", "slowed", "surprised", "taunted", "weakened"];
    conditions = DS_CONDITIONS.map(id => {
      const cfg = CONFIG.statusEffects[id] ?? {};
      return {
        id,
        name: cfg.name ?? (id.charAt(0).toUpperCase() + id.slice(1)),
        icon: cfg.icon ?? null,
        active: activeStatuses.has(id),
      };
    });
  }

  return { sections, charPanel, conditions };
}

/* ================================================================
 *  Favorites Button (Draw Steel Plus)
 * ================================================================ */

export async function buildFavoritesData(actor) {
  const sections = [];
  const isNpc = actor.type === "npc";

  const basicDsids = await getBasicAbilityDsids();
  const knownMainCategories = new Set(["signature", "heroic", "epic", "freeStrike"]);

  // Main action sub-buckets (mirrors buildMainActionData)
  const signature   = [];
  const heroic      = [];
  const basics      = [];
  const freeStrikes = [];
  // Other type buckets
  const maneuvers    = [];
  const freeManeuvers = [];
  const triggered    = [];
  const freeTriggered = [];
  const noAction     = [];
  const features     = [];
  const items        = [];

  for (const item of actor.items) {
    if (!item.flags?.["draw-steel-plus"]?.favorite) continue;

    if (item.type === "ability") {
      const t   = item.system.type;
      const cat = item.system.category;
      const dsid = item.system._dsid;

      if (t === "main") {
        if (cat === "freeStrike") {
          freeStrikes.push(abilityEntry(item));
        } else if (dsid && basicDsids.has(dsid)) {
          basics.push(abilityEntry(item));
        } else if (cat === "signature") {
          signature.push(abilityEntry(item));
        } else if (cat === "heroic" || cat === "epic") {
          heroic.push(abilityEntry(item));
        } else if (!knownMainCategories.has(cat)) {
          // Uncategorized: has resource cost → heroic bucket, otherwise → signature bucket
          if (item.system.resource) heroic.push(abilityEntry(item));
          else signature.push(abilityEntry(item));
        }
      } else if (t === "maneuver") maneuvers.push(abilityEntry(item));
      else if (t === "freeManeuver") freeManeuvers.push(abilityEntry(item));
      else if (t === "triggered") triggered.push(abilityEntry(item));
      else if (t === "freeTriggered") freeTriggered.push(abilityEntry(item));
      else if (t === "none") noAction.push(abilityEntry(item));
      else signature.push(abilityEntry(item)); // fallback
    } else if (item.type === "treasure") {
      items.push(featureEntry(item, "fa-solid fa-flask"));
    } else {
      // features, perks, titles, complications, ancestryTraits, etc.
      features.push(featureEntry(item, "fa-solid fa-star"));
    }
  }

  if (signature.length) sections.push({ title: loc("DSAHUD.Sections.Signature"), items: signature });
  heroic.sort((a, b) => ((Number(a.cost) || 0) - (Number(b.cost) || 0)) || a.name.localeCompare(b.name));
  if (heroic.length) sections.push({ title: loc(isNpc ? "DSAHUD.Sections.Malice" : "DSAHUD.Sections.Heroic"), items: heroic });
  if (basics.length) sections.push({ title: loc("DSAHUD.Sections.BasicAbilities"), items: basics });
  if (freeStrikes.length) sections.push({ title: loc("DSAHUD.Sections.FreeStrikes"), items: freeStrikes });
  if (maneuvers.length) sections.push({ title: loc("DSAHUD.Sections.SpecialManeuver"), items: maneuvers });
  if (freeManeuvers.length) sections.push({ title: loc("DSAHUD.Sections.FreeManeuver"), items: freeManeuvers });
  if (triggered.length) sections.push({ title: loc("DSAHUD.Sections.TriggeredAction"), items: triggered });
  if (freeTriggered.length) sections.push({ title: loc("DSAHUD.Sections.FreeTriggeredAction"), items: freeTriggered });
  if (noAction.length) sections.push({ title: loc("DSAHUD.Sections.NoAction"), items: noAction });
  if (features.length) sections.push({ title: loc("DSAHUD.Sections.Feature"), items: features });
  if (items.length) sections.push({ title: loc("DSAHUD.Sections.Item"), items });

  return sections;
}

/* ================================================================
 *  Button 5: Items
 * ================================================================ */

export async function buildItemsData(actor) {
  const sections = [];
  const items = actor.items;

  const consumable = [];
  const trinket = [];
  const leveled = [];
  const artifact = [];

  for (const item of items) {
    if (item.type !== "treasure") continue;
    const category = item.system.category ?? "";
    if (category === "consumable") consumable.push(featureEntry(item, "fa-solid fa-flask"));
    else if (category === "trinket") trinket.push(featureEntry(item, "fa-solid fa-ring"));
    else if (category === "artifact") artifact.push(featureEntry(item, "fa-solid fa-gem"));
    else leveled.push(featureEntry(item, "fa-solid fa-sword"));
  }

  if (consumable.length) sections.push({ title: loc("DSAHUD.Sections.Consumable"), items: consumable });
  if (trinket.length) sections.push({ title: loc("DSAHUD.Sections.Trinket"), items: trinket });
  if (leveled.length) sections.push({ title: loc("DSAHUD.Sections.Leveled"), items: leveled });
  if (artifact.length) sections.push({ title: loc("DSAHUD.Sections.Leveled"), items: artifact });

  return sections;
}

/* ================================================================
 *  Button 6: Features
 * ================================================================ */

export async function buildFeaturesData(actor) {
  const sections = [];
  const items = actor.items;

  const features = [];
  const ancestryTraits = [];
  const perks = [];
  const titles = [];
  const complications = [];

  for (const item of items) {
    switch (item.type) {
      case "feature": features.push(featureEntry(item, "fa-solid fa-list")); break;
      case "ancestryTrait": ancestryTraits.push(featureEntry(item, "fa-solid fa-dna")); break;
      case "perk": perks.push(featureEntry(item, "fa-solid fa-plus")); break;
      case "title": titles.push(featureEntry(item, "fa-solid fa-crown")); break;
      case "complication": complications.push(featureEntry(item, "fa-solid fa-triangle-exclamation")); break;
    }
  }

  if (features.length) sections.push({ title: loc("DSAHUD.Sections.Feature"), items: features });
  if (ancestryTraits.length) sections.push({ title: loc("DSAHUD.Sections.AncestryTrait"), items: ancestryTraits });
  if (perks.length) sections.push({ title: loc("DSAHUD.Sections.Perk"), items: perks });
  if (titles.length) sections.push({ title: loc("DSAHUD.Sections.Title"), items: titles });
  if (complications.length) sections.push({ title: loc("DSAHUD.Sections.Complication"), items: complications });

  return sections;
}

/* ================================================================
 *  NPC Button: Malice (No Action type abilities)
 * ================================================================ */

export async function buildMaliceData(actor) {
  const sections = [];
  const items = actor.items;

  const malice = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "none") continue;
    malice.push(abilityEntry(item));
  }
  malice.sort((a, b) => ((Number(a.cost) || 0) - (Number(b.cost) || 0)) || a.name.localeCompare(b.name));
  if (malice.length) sections.push({ title: loc("DSAHUD.Sections.Malice"), items: malice });

  return sections;
}

/* ================================================================
 *  NPC Button: Villain Action (villain type abilities)
 * ================================================================ */

export async function buildVillainActionData(actor) {
  const sections = [];
  const items = actor.items;

  const villainActions = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "villain") continue;
    villainActions.push(abilityEntry(item));
  }
  if (villainActions.length) sections.push({ title: loc("DSAHUD.Sections.VillainAction"), items: villainActions });

  return sections;
}

/* ================================================================
 *  NPC Button: Monster (characteristics / ability tests)
 * ================================================================ */

export async function buildMonsterData(actor) {
  const sections = [];
  const items = actor.items;

  // Ability Tests (characteristics)
  const chars = actor.system.characteristics ?? {};
  const charItems = [];
  for (const [name, data] of Object.entries(chars)) {
    charItems.push(charEntry(name, data.value));
  }
  if (charItems.length) sections.push({ title: loc("DSAHUD.Sections.AbilityTest"), items: charItems });

  // Malice (No Action type abilities)
  const malice = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "none") continue;
    malice.push(abilityEntry(item));
  }
  malice.sort((a, b) => ((Number(a.cost) || 0) - (Number(b.cost) || 0)) || a.name.localeCompare(b.name));
  if (malice.length) sections.push({ title: loc("DSAHUD.Sections.Malice"), items: malice });

  // Villain Actions
  const villainActions = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "villain") continue;
    villainActions.push(abilityEntry(item));
  }
  if (villainActions.length) sections.push({ title: loc("DSAHUD.Sections.VillainAction"), items: villainActions });

  // ---- NPC charPanel (stamina bar, size/movement) ----
  let charPanel = null;
  if (game.settings.get(MODULE_ID, "showCharPanel")) {
    const staminaMax = actor.system.stamina.max ?? 0;
    const staminaVal = actor.system.stamina.value ?? 0;
    const fillWidth = staminaMax > 0 ? Math.max(0, Math.min(100, (staminaVal / staminaMax) * 100)) : 0;
    const ratio = staminaMax > 0 ? Math.max(0, Math.min(1, staminaVal / staminaMax)) : 0;
    const hue = Math.round(ratio * 120);
    const fillColor = `hsl(${hue}, 75%, 42%)`;
    const staminaLabel = `${staminaVal} / ${staminaMax}`;

    const combatSize = actor.system.combat?.size ?? {};
    const sizeVal = combatSize.value ?? 1;
    const sizeLetter = combatSize.letter ?? "M";
    const sizeDisplay = sizeVal === 1 ? `1${sizeLetter}` : `${sizeVal}`;
    const stability = actor.system.combat?.stability ?? 0;

    const mov = actor.system.movement ?? {};
    const movSpeed = mov.value ?? 5;
    const movTypes = Array.from(mov.types ?? []);
    const movDisplay = movTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(", ") || "Walk";
    const movDisengage = mov.disengage ?? 1;

    charPanel = {
      name: actor.name,
      stamina: {
        label: staminaLabel,
        fillLeft: "0",
        fillWidth: fillWidth.toFixed(2),
        fillColor,
        zeroPercent: null,
        tempLeft: null,
        tempWidth: null,
      },
      recoveries: null,
      surges: null,
      heroicResource: null,
      size: sizeDisplay,
      stability,
      movement: { speed: movSpeed, display: movDisplay, disengage: movDisengage },
      skills: null,
    };
  }

  // Conditions — built independently of charPanel setting
  let conditions = null;
  if (game.settings.get(MODULE_ID, "showConditionsPanel")) {
    const activeStatuses = actor.statuses ?? new Set();
    const DS_CONDITIONS = ["bleeding", "dazed", "frightened", "grabbed", "prone", "restrained", "slowed", "surprised", "taunted", "weakened"];
    conditions = DS_CONDITIONS.map(id => {
      const cfg = CONFIG.statusEffects[id] ?? {};
      return {
        id,
        name: cfg.name ?? (id.charAt(0).toUpperCase() + id.slice(1)),
        icon: cfg.icon ?? null,
        active: activeStatuses.has(id),
      };
    });
  }

  return { sections, charPanel, conditions };
}
