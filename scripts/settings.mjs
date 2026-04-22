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
   * Show Character Panel — toggles the left-column character overview in the Character popup.
   */
  game.settings.register(MODULE_ID, "showCharPanel", {
    name: game.i18n.localize("DSAHUD.Settings.ShowCharPanel.Name"),
    hint: game.i18n.localize("DSAHUD.Settings.ShowCharPanel.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {},
  });

  /**
   * Show Conditions Panel — toggleable status conditions column in the Character popup.
   */
  game.settings.register(MODULE_ID, "showConditionsPanel", {
    name: game.i18n.localize("DSAHUD.Settings.ShowConditionsPanel.Name"),
    hint: game.i18n.localize("DSAHUD.Settings.ShowConditionsPanel.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {},
  });

  /**
   * Basic Abilities Configuration — a JSON object mapping UUID →
   * { userId: boolean, __monsters__: boolean, __retainers__: boolean }.
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
 * FormApplication for configuring which generic abilities are shown per user/monsters/retainers.
 */
class GenericAbilitiesConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "dsahud-generic-abilities-config",
      title: "Basic Abilities Configuration",
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
      const basicFolder = folders.find(f => f.name === "Basic Abilities")
        ?? folders.find(f => f.name === "Basic Actions");
      if (basicFolder) {
        const index = await pack.getIndex({ fields: ["system.type", "system.category", "system._dsid", "folder", "name"] });
        for (const entry of index) {
          if (entry.folder !== basicFolder.id) continue;
          if (entry.system?.type === "move") continue;
          if (entry.system?.category === "freeStrike") continue;
          abilities.push({
            uuid: `Compendium.draw-steel.abilities.Item.${entry._id}`,
            name: entry.name,
            type: entry.system?.type ?? "unknown",
          });
        }
      }
    }

    // Sort abilities alphabetically
    abilities.sort((a, b) => a.name.localeCompare(b.name));

    // Build checkbox rows — use item ID (no dots) as form field key
    this._uuidByItemId = {};
    const rows = abilities.map(a => {
      const itemId = a.uuid.split(".").pop();
      this._uuidByItemId[itemId] = a.uuid;
      const abilityConfig = config[a.uuid] ?? {};
      const columns = {};
      for (const u of users) {
        columns[u.id] = abilityConfig[u.id] !== false; // default true
      }
      columns["__monsters__"] = abilityConfig["__monsters__"] !== false;
      columns["__retainers__"] = abilityConfig["__retainers__"] !== false;
      return { uuid: a.uuid, itemId: a.uuid.split(".").pop(), name: a.name, type: a.type, columns };
    });

    return { rows, users, hasMonsters: true, hasRetainers: true };
  }

  async _updateObject(_event, formData) {
    const config = {};
    const expanded = foundry.utils.expandObject(formData);
    const allColumns = [...game.users.filter(u => !u.isGM).map(u => u.id), "__monsters__", "__retainers__"];
    // Iterate every known ability; set each column explicitly — unchecked boxes are absent from formData so default to false
    for (const [itemId, uuid] of Object.entries(this._uuidByItemId ?? {})) {
      const val = expanded[itemId] ?? {};
      config[uuid] = {};
      for (const col of allColumns) {
        config[uuid][col] = !!(val[col]);
      }
    }
    await game.settings.set(MODULE_ID, "genericAbilitiesConfig", config);
  }
}
