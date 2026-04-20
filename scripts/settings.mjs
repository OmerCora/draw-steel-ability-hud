import { MODULE_ID } from "./config.mjs";

export function registerSettings() {

  /**
   * Enable ability tooltips — client preference, auto-disabled if Draw Steel Plus is active
   * (so DS+ can handle its own tooltip system without conflict).
   */
  game.settings.register(MODULE_ID, "enableTooltips", {
    name: game.i18n.localize("DSAHUD.Settings.EnableTooltips.Name"),
    hint: game.i18n.localize("DSAHUD.Settings.EnableTooltips.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {},
  });

  /**
   * Generic Abilities Configuration — a JSON object mapping UUID → { userId: boolean, __monsters__: boolean }.
   * Default: empty = all enabled.
   */
  game.settings.register(MODULE_ID, "genericAbilitiesConfig", {
    name: game.i18n.localize("DSAHUD.Settings.BasicAbilities.Name"),
    hint: game.i18n.localize("DSAHUD.Settings.BasicAbilities.Hint"),
    scope: "world",
    config: false, // opened via custom menu
    type: Object,
    default: {},
  });

  /**
   * Homebrew Maneuvers — array of UUIDs.
   */
  game.settings.register(MODULE_ID, "homebrewManeuvers", {
    name: game.i18n.localize("DSAHUD.Settings.HomebrewManeuvers.Name"),
    hint: game.i18n.localize("DSAHUD.Settings.HomebrewManeuvers.Hint"),
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  /**
   * Settings menu button for Generic Abilities.
   */
  game.settings.registerMenu(MODULE_ID, "genericAbilitiesMenu", {
    name: game.i18n.localize("DSAHUD.Settings.BasicAbilities.Name"),
    label: game.i18n.localize("DSAHUD.Settings.BasicAbilities.Label"),
    hint: game.i18n.localize("DSAHUD.Settings.BasicAbilities.Hint"),
    icon: "fas fa-cogs",
    type: GenericAbilitiesConfig,
    restricted: true,
  });
}

/**
 * FormApplication for configuring which generic abilities are shown per user/monsters.
 */
class GenericAbilitiesConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "dsahud-generic-abilities-config",
      title: "Generic Abilities Configuration",
      template: `modules/${MODULE_ID}/templates/generic-config.hbs`,
      width: 700,
      height: "auto",
      closeOnSubmit: true,
    });
  }

  async getData() {
    const config = game.settings.get(MODULE_ID, "genericAbilitiesConfig") ?? {};
    const users = game.users.filter(u => !u.isGM);

    // Get basic abilities from compendium
    const pack = game.packs.get("draw-steel.abilities");
    const abilities = [];
    if (pack) {
      const folders = pack.folders ?? [];
      const basicFolder = folders.find(f => f.name === "Basic Abilities");
      if (basicFolder) {
        const index = await pack.getIndex({ fields: ["system.type", "folder", "name"] });
        for (const entry of index) {
          if (entry.folder !== basicFolder.id) continue;
          abilities.push({
            uuid: `Compendium.draw-steel.abilities.Item.${entry._id}`,
            name: entry.name,
            type: entry.system?.type ?? "unknown",
          });
        }
      }
    }

    // Build checkbox rows
    const rows = abilities.map(a => {
      const abilityConfig = config[a.uuid] ?? {};
      const columns = {};
      for (const u of users) {
        columns[u.id] = abilityConfig[u.id] !== false; // default true
      }
      columns["__monsters__"] = abilityConfig["__monsters__"] !== false;
      return { uuid: a.uuid, name: a.name, type: a.type, columns };
    });

    return { rows, users, hasMonsters: true };
  }

  async _updateObject(_event, formData) {
    const config = {};
    const expanded = foundry.utils.expandObject(formData);
    // formData has keys like "uuid.userId" = true/false
    for (const [key, val] of Object.entries(expanded)) {
      // key is UUID (dots replaced), val is { userId: on/off }
      config[key] = {};
      for (const [col, checked] of Object.entries(val)) {
        config[key][col] = !!checked;
      }
    }
    await game.settings.set(MODULE_ID, "genericAbilitiesConfig", config);
  }
}
