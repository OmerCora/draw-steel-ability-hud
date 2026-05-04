import { MODULE_ID } from "./config.mjs";
import { AbilityHud } from "./ability-hud.mjs";
import { registerSettings } from "./settings.mjs";

let hud = null;

Hooks.once("init", () => {
  registerSettings();
  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/pinned-ability.hbs`,
  ]);
});

Hooks.once("ready", () => {
  hud = new AbilityHud();
  hud.render(true);
});

/** Re-render when token selection or actor data changes. */
Hooks.on("dsahud.refresh", (options) => hud?.refresh(options));
Hooks.on("dsresources.trackingReset", () => hud?.refresh());
Hooks.on("dsresources.trackingChanged", () => hud?.refresh());
Hooks.on("controlToken", () => hud?.refresh());
Hooks.on("createCombat", () => hud?.refresh());
Hooks.on("updateActor", () => hud?.refresh());
Hooks.on("updateItem", () => hud?.refresh());
Hooks.on("createItem", () => hud?.refresh());
Hooks.on("deleteItem", () => hud?.refresh());
Hooks.on("updateCombat", () => hud?.refresh());
Hooks.on("deleteCombat", () => hud?.refresh());
Hooks.on("combatTurnChange", () => hud?.refresh());
Hooks.on("updateActiveEffect", () => hud?.refresh());
Hooks.on("createActiveEffect", () => hud?.refresh());
Hooks.on("deleteActiveEffect", () => hud?.refresh());
