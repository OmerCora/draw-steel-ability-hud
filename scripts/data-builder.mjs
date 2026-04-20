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
  let emoji = "🔹";
  if (cat === "signature") emoji = "✦";
  else if (cat === "heroic") emoji = "🌟";
  else if (cat === "epic") emoji = "💎";
  else if (cat === "freeStrike") emoji = "🗡️";
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
function featureEntry(item, emoji = "📄") {
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
  const icons = { might: "🅼", agility: "🅰", reason: "🆁", intuition: "🅸", presence: "🅿" };
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  return {
    id: `char-${name}`,
    name: displayName,
    img: null,
    cost: modifier(value),
    emoji: icons[name] ?? "🔹",
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
  const basicFolder = folders.find(f => f.name === "Basic Abilities");
  if (!basicFolder) return _basicAbilityDsids;
  const index = await pack.getIndex({ fields: ["system._dsid", "folder"] });
  for (const entry of index) {
    if (entry.folder !== basicFolder.id) continue;
    if (entry.system?._dsid) _basicAbilityDsids.add(entry.system._dsid);
  }
  return _basicAbilityDsids;
}

/** Get the configured basic ability UUIDs for this actor, filtered by GM settings. */
async function getGenericAbilities(actor, abilityType) {
  const config = game.settings.get(MODULE_ID, "genericAbilitiesConfig") ?? {};
  const userId = game.user.id;

  // Determine which column to check: user ID or "monsters" for non-hero
  const column = actor.type === "hero" ? userId : "__monsters__";

  const pack = game.packs.get("draw-steel.abilities");
  if (!pack) return [];

  // Get all items in the "Basic Abilities" folder
  const index = await pack.getIndex({ fields: ["system.type", "folder", "name", "img", "system.resource", "system.category"] });

  // Find the "Basic Abilities" folder in the pack
  const folders = pack.folders ?? [];
  const basicFolder = folders.find(f => f.name === "Basic Abilities");
  if (!basicFolder) return [];

  const results = [];
  for (const entry of index) {
    if (entry.folder !== basicFolder.id) continue;
    // Check ability type
    if (abilityType && entry.system?.type !== abilityType) continue;

    const uuid = `Compendium.draw-steel.abilities.Item.${entry._id}`;

    // Check if this ability is enabled for this column
    const abilityConfig = config[uuid];
    if (abilityConfig && abilityConfig[column] === false) continue;

    results.push({
      id: `generic-${entry._id}`,
      uuid,
      name: entry.name,
      img: entry.img,
      cost: (entry.system?.resource && entry.system.resource !== 0) ? `${entry.system.resource}` : "",
      emoji: "⚙️",
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
        emoji: "🔧",
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

  // Signature abilities
  const signature = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "main") continue;
    if (item.system.category === "signature") signature.push(abilityEntry(item));
  }

  // Heroic abilities (main action type) — labelled "Malice" for NPCs
  const heroic = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "main") continue;
    if (item.system.category === "heroic" || item.system.category === "epic") heroic.push(abilityEntry(item));
  }

  // Uncategorized main actions — treat like signature if free, heroic/malice if it has a cost
  const knownCategories = new Set(["signature", "heroic", "epic", "freeStrike"]);
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "main") continue;
    if (knownCategories.has(item.system.category)) continue;
    if (item.system.resource) {
      heroic.push(abilityEntry(item));
    } else {
      signature.push(abilityEntry(item));
    }
  }

  if (signature.length) sections.push({ title: loc("DSAHUD.Sections.Signature"), items: signature });
  if (heroic.length) sections.push({ title: loc(isNpc ? "DSAHUD.Sections.Malice" : "DSAHUD.Sections.Heroic"), items: heroic });

  // Free Strikes (ability items with freeStrike category)
  const freeStrikes = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.category !== "freeStrike") continue;
    freeStrikes.push(abilityEntry(item));
  }
  if (freeStrikes.length) sections.push({ title: loc("DSAHUD.Sections.FreeStrikes"), items: freeStrikes });

  // NPC Free Strike button (system-level, uses actor.system.performFreeStrike)
  if (isNpc) {
    const fs = actor.system.freeStrike;
    const dmg = fs?.value ?? actor.system.monster?.freeStrike ?? "?";
    sections.push({
      title: loc("DSAHUD.Sections.FreeStrike"),
      items: [staticEntry("npc-free-strike", loc("DSAHUD.Sections.FreeStrike"), "🗡️", "npcFreeStrike", `${dmg}`)],
    });
  }

  // Basic Abilities (from compendium, main action type)
  const basic = await getGenericAbilities(actor, "main");
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
 *  Button 4: Character
 * ================================================================ */

export async function buildCharacterData(actor) {
  const sections = [];

  // Ability Tests
  const chars = actor.system.characteristics ?? {};
  const charItems = [];
  for (const [name, data] of Object.entries(chars)) {
    charItems.push(charEntry(name, data.value));
  }
  if (charItems.length) sections.push({ title: loc("DSAHUD.Sections.AbilityTest"), items: charItems });

  // Recovery
  if (actor.type === "hero") {
    const rec = actor.system.recoveries;
    sections.push({
      title: loc("DSAHUD.Sections.Recovery"),
      items: [staticEntry("recovery", loc("DSAHUD.Actions.SpendRecovery"), "💚", "recovery", `${rec?.value ?? 0}/${rec?.max ?? 0}`)],
    });

    // Hero Tokens
    const heroTokens = game.actors?.heroTokens?.value ?? 0;
    const surges = actor.system.hero?.surges ?? 0;
    sections.push({
      title: loc("DSAHUD.Sections.HeroTokens"),
      items: [
        staticEntry("heroTokenRecovery", loc("DSAHUD.Actions.HeroTokenRecovery"), "💛", "heroTokenRecovery", `${heroTokens} tokens`),
        staticEntry("gainSurges", loc("DSAHUD.Actions.GainSurges"), "⚡", "gainSurges", `${surges} surges`),
      ],
    });

    // Spend Surge
    sections.push({
      title: loc("DSAHUD.Sections.SpendSurge"),
      items: [
        staticEntry("damageSurge1", loc("DSAHUD.Actions.DamageSurge1"), "💥", "damageSurge", `1 surge`),
        staticEntry("damageSurge2", loc("DSAHUD.Actions.DamageSurge2"), "💥", "damageSurge2", `2 surges`),
        staticEntry("damageSurge3", loc("DSAHUD.Actions.DamageSurge3"), "💥", "damageSurge3", `3 surges`),
        staticEntry("potencySurge", loc("DSAHUD.Actions.PotencySurge"), "✨", "potencySurge", `2 surges`),
      ],
    });
  }

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
    if (category === "consumable") consumable.push(featureEntry(item, "🧪"));
    else if (category === "trinket") trinket.push(featureEntry(item, "💍"));
    else if (category === "artifact") artifact.push(featureEntry(item, "💎"));
    else leveled.push(featureEntry(item, "⚔️"));
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
      case "feature": features.push(featureEntry(item, "📋")); break;
      case "ancestryTrait": ancestryTraits.push(featureEntry(item, "🧬")); break;
      case "perk": perks.push(featureEntry(item, "⭐")); break;
      case "title": titles.push(featureEntry(item, "👑")); break;
      case "complication": complications.push(featureEntry(item, "⚠️")); break;
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
  if (malice.length) sections.push({ title: loc("DSAHUD.Sections.Malice"), items: malice });

  // Villain Actions
  const villainActions = [];
  for (const item of items) {
    if (item.type !== "ability") continue;
    if (item.system.type !== "villain") continue;
    villainActions.push(abilityEntry(item));
  }
  if (villainActions.length) sections.push({ title: loc("DSAHUD.Sections.VillainAction"), items: villainActions });

  return sections;
}
