import { MODULE_ID } from "./config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A persistent Foundry ApplicationV2 window that displays an ability tooltip.
 * Created by middle-clicking an action in the Ability HUD.
 * Supports standard Foundry window chrome: drag, minimize, pop-out (detach), close.
 */
export class PinnedAbilityApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["draw-steel-ability-hud", "dsahud-pinned-window"],
    window: { resizable: true, minimizable: true },
    position: { width: 320, height: "auto" },
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/pinned-ability.hbs`,
    },
  };

  /** @type {Set<PinnedAbilityApp>} */
  static #instances = new Set();

  #itemName = "";
  #content = "";
  #uiScale = 1;

  /**
   * @param {string} itemName   The ability name shown in the window title bar.
   * @param {string} content    Pre-built inner HTML (from AbilityHud#buildTooltipHTML).
   * @param {number} uiScale     HUD UI scale to apply to pinned content.
   * @param {object} [options]  ApplicationV2 options (can include `position: {left, top}`).
   */
  constructor(itemName, content, uiScale = 1, options = {}) {
    const id = `dsahud-pinned-${foundry.utils.randomID()}`;
    super(foundry.utils.mergeObject({ id }, options, { inplace: false }));
    this.#itemName = itemName;
    this.#content = content;
    this.#uiScale = uiScale;
    PinnedAbilityApp.#instances.add(this);
  }

  /** @override */
  get title() {
    return this.#itemName;
  }

  /** @override */
  async _prepareContext(_options) {
    return { content: this.#content, uiScale: this.#uiScale };
  }

  /** @override Remove from instance tracking on close. */
  async close(options = {}) {
    PinnedAbilityApp.#instances.delete(this);
    return super.close(options);
  }

  /** Close all open pinned ability windows (called when the HUD itself closes). */
  static closeAll() {
    for (const app of PinnedAbilityApp.#instances) app.close();
    PinnedAbilityApp.#instances.clear();
  }
}
