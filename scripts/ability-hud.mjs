import { MODULE_ID } from "./config.mjs";
import { handleAction } from "./actions.mjs";
import { buildMainActionData, buildManeuverData, buildTriggeredData, buildCharacterData, buildItemsData, buildFeaturesData, buildMaliceData, buildVillainActionData, buildMonsterData } from "./data-builder.mjs";

/**
 * Fixed HUD bar rendered above the Foundry hotbar.
 * Shows 6 buttons for the selected token; hover opens a popup menu.
 */
export class AbilityHud extends Application {
  /** @type {ReturnType<typeof setTimeout>|null} */
  #closeTimer = null;
  #resizeHandler = null;
  #sidebarHookIds = [];

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ds-ability-hud",
      template: `modules/${MODULE_ID}/templates/ability-hud.hbs`,
      popOut: false,
      minimizable: false,
      resizable: false,
    });
  }

  /** Inject into body — we use position:fixed so no need to be in #ui-bottom. */
  _injectHTML(html) {
    document.body.appendChild(html[0]);
    this._element = html;
  }

  /* ---------------------------------------- */
  /*  Data                                    */
  /* ---------------------------------------- */

  /** Resolve the actor from the currently controlled token. */
  #getActor() {
    const token = canvas.tokens?.controlled?.[0];
    return token?.actor ?? null;
  }

  async getData(options = {}) {
    const actor = this.#getActor();
    if (!actor || (actor.type !== "hero" && actor.type !== "npc")) {
      return { hasActor: false, buttons: [] };
    }

    const buttons = [];

    if (actor.type === "hero") {
      buttons.push(
        { id: "main-action", label: game.i18n.localize("DSAHUD.Buttons.MainAction"), icon: "fa-solid fa-sword", sections: await buildMainActionData(actor) },
        { id: "maneuver", label: game.i18n.localize("DSAHUD.Buttons.Maneuver"), icon: "fa-solid fa-person-running", sections: await buildManeuverData(actor) },
        { id: "triggered-action", label: game.i18n.localize("DSAHUD.Buttons.TriggeredAction"), icon: "fa-solid fa-bolt", sections: await buildTriggeredData(actor) },
        { id: "character", label: game.i18n.localize("DSAHUD.Buttons.Character"), icon: "fa-solid fa-user", sections: await buildCharacterData(actor) },
        { id: "items", label: game.i18n.localize("DSAHUD.Buttons.Items"), icon: "fa-solid fa-bag-shopping", sections: await buildItemsData(actor) },
        { id: "features", label: game.i18n.localize("DSAHUD.Buttons.Features"), icon: "fa-solid fa-scroll", sections: await buildFeaturesData(actor) },
      );
    } else {
      // NPC: show abilities grouped by type
      buttons.push(
        { id: "main-action", label: game.i18n.localize("DSAHUD.Buttons.MainAction"), icon: "fa-solid fa-sword", sections: await buildMainActionData(actor) },
        { id: "maneuver", label: game.i18n.localize("DSAHUD.Buttons.Maneuver"), icon: "fa-solid fa-person-running", sections: await buildManeuverData(actor) },
        { id: "triggered-action", label: game.i18n.localize("DSAHUD.Buttons.TriggeredAction"), icon: "fa-solid fa-bolt", sections: await buildTriggeredData(actor) },
        { id: "monster", label: game.i18n.localize("DSAHUD.Buttons.Monster"), icon: "fa-solid fa-skull", sections: await buildMonsterData(actor) },
        { id: "features", label: game.i18n.localize("DSAHUD.Buttons.Features"), icon: "fa-solid fa-scroll", sections: await buildFeaturesData(actor) },
      );
    }

    return { hasActor: true, buttons };
  }

  /* ---------------------------------------- */
  /*  Render & Lifecycle                      */
  /* ---------------------------------------- */

  activateListeners(html) {
    super.activateListeners(html);

    // Ensure fallback tooltip element exists for when DS Plus is not active
    if (!document.getElementById("dsahud-tooltip")) {
      const tt = document.createElement("div");
      tt.id = "dsahud-tooltip";
      document.body.appendChild(tt);
    }

    // Hover on a top-level button → show its popup
    html.find(".dsahud-button").on("mouseenter", (ev) => {
      this.#cancelClose();
      html.find(".dsahud-popup.active").removeClass("active");
      const popup = $(ev.currentTarget).find(".dsahud-popup");
      popup.addClass("active");
    });

    html.find(".dsahud-button").on("mouseleave", (ev) => {
      this.#scheduleClose(html);
    });

    // Keep popup open while mouse is inside it
    html.find(".dsahud-popup").on("mouseenter", () => this.#cancelClose());
    html.find(".dsahud-popup").on("mouseleave", () => {
      this.#hideTooltip();
      this.#scheduleClose(html);
    });
    const tooltipsEnabled = game.settings.get(MODULE_ID, "enableTooltips");
    if (tooltipsEnabled) {
      const dspActive = game.modules.get("draw-steel-plus")?.active ?? false;
      let dspDeactivateTimer = null;

      html.find(".dsahud-action").on("mouseenter", async (ev) => {
        const target = ev.currentTarget;

        if (dspActive) {
          // Cancel any pending deactivation so tooltip stays open when moving between rows
          clearTimeout(dspDeactivateTimer);
          dspDeactivateTimer = null;
          const uuid = target.dataset.tooltipUuid;
          if (!uuid) return;
          // Manually activate Foundry's tooltip with a loading span so DS Plus's
          // MutationObserver fires and renders the rich tooltip.
          game.tooltip.activate(target, {
            content: `<span class="loading" data-uuid="${uuid}"></span>`,
            direction: "RIGHT",
          });
          // DS Plus reads data-tooltip-direction off #tooltip synchronously in its
          // MutationObserver callback — set it explicitly so it always renders to the right.
          const tooltipEl = document.getElementById("tooltip");
          if (tooltipEl) tooltipEl.dataset.tooltipDirection = "RIGHT";
        } else {
          const actor = this.#getActor();
          if (!actor) return;
          await this.#showTooltip(target, actor);
        }
      });

      html.find(".dsahud-action").on("mouseleave", () => {
        if (dspActive) {
          // Delay deactivation so DS Plus's requestAnimationFrame can complete its
          // positioning call before _element is cleared — prevents the getBoundingClientRect crash.
          dspDeactivateTimer = setTimeout(() => {
            game.tooltip.deactivate();
            dspDeactivateTimer = null;
          }, 80);
        } else {
          this.#hideTooltip();
        }
      });

      // Also deactivate DS Plus tooltip when the popup closes
      html.find(".dsahud-popup").on("mouseleave", () => {
        if (dspActive) {
          clearTimeout(dspDeactivateTimer);
          dspDeactivateTimer = setTimeout(() => {
            game.tooltip.deactivate();
            dspDeactivateTimer = null;
          }, 80);
        }
      });
    }

    // Click an action item (left = use/roll, right = share to chat)
    html.find(".dsahud-action").on("click contextmenu", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const target = ev.currentTarget;
      const actionType = target.dataset.actionType;
      const actionId = target.dataset.actionId;
      const actor = this.#getActor();
      if (!actor) return;
      const isRightClick = ev.type === "contextmenu";
      await handleAction(actor, actionType, actionId, { isRightClick });
    });
  }

  /** Fallback tooltip used when DS Plus is not active — mirrors DS Plus's item-tooltip structure. */
  async #showTooltip(actionEl, actor) {
    const uuid = actionEl.dataset.tooltipUuid;
    const actionType = actionEl.dataset.actionType;
    const actionId   = actionEl.dataset.actionId;

    let item = null;
    if (uuid) {
      item = await fromUuid(uuid).catch(() => null);
    }
    if (!item && (actionType === "ability" || actionType === "feature")) {
      item = actor.items.get(actionId);
    }
    if (!item && actionType === "compendiumAbility" && actionId) {
      item = await fromUuid(actionId).catch(() => null);
    }
    if (!item) return;

    const tt = document.getElementById("dsahud-tooltip");
    if (!tt) return;

    const sys  = item.system;
    const ds   = globalThis.ds;
    const type = item.type;

    // --- Header badges (resource cost) ---
    const headerBadges = [];
    if (sys.resource != null && sys.resource > 0) {
      headerBadges.push({ label: "Cost", value: String(sys.resource) });
    }

    // --- Metadata row (type, distance, target, keywords) ---
    const metadata = [];
    if (type === "ability") {
      const typeLbl = ds?.CONFIG?.abilities?.types?.[sys.type]?.label ?? sys.type ?? "";
      if (typeLbl) metadata.push({ label: "Type", value: typeLbl });

      const fl = sys.formattedLabels;
      if (fl) {
        if (fl.distance && fl.distance !== "—") metadata.push({ label: "Distance", value: fl.distance });
        if (fl.target   && fl.target   !== "—") metadata.push({ label: "Target",   value: fl.target });
      }
      const trigger = sys.trigger?.trim?.();
      const isTriggered = ds?.CONFIG?.abilities?.types?.[sys.type]?.triggered;
      if (trigger && isTriggered) metadata.push({ label: "Trigger", value: trigger });
    }

    // --- Keywords pills ---
    const keywords = sys.keywords instanceof Set
      ? Array.from(sys.keywords)
      : (Array.isArray(sys.keywords) ? sys.keywords : []);
    const pills = keywords.map(k => ds?.CONFIG?.abilities?.keywords?.[k]?.label ?? k);

    // --- Ability details (power roll tiers + effects) ---
    let abilityDetails = null;
    let descriptionHtml = "";

    if (type === "ability") {
      let cardContext = {};
      const rollData = actor.getRollData?.();
      const canEval  = !!rollData;
      if (canEval && typeof sys.getSheetContext === "function") {
        try { await sys.getSheetContext(cardContext); } catch {}
      }

      const hasPowerRolls = cardContext.powerRolls && cardContext.powerRollEffects;
      if (hasPowerRolls || cardContext.enrichedBeforeEffect || cardContext.enrichedAfterEffect || sys.story) {
        let flavor = "";
        if (sys.story?.trim()) {
          try {
            flavor = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
              sys.story.trim(), { async: true, relativeTo: item }
            );
          } catch {}
        }

        const powerRollLine = hasPowerRolls && !sys.power?.roll?.reactive && cardContext.powerRollBonus
          ? game.i18n.format("DRAW_STEEL.ROLL.Power.RollPlusBonus", { bonus: cardContext.powerRollBonus })
          : null;

        let powerRollTiers = [];
        if (hasPowerRolls) {
          try {
            const toStr = (v) => {
              if (v == null) return "";
              if (typeof v === "string") return v;
              if (typeof v === "number") return String(v);
              return v?.value ?? v?.html ?? v?.text ?? v?.innerHTML ?? "";
            };
            const t1 = toStr(cardContext.powerRollEffects?.tier1);
            const t2 = toStr(cardContext.powerRollEffects?.tier2);
            const t3 = toStr(cardContext.powerRollEffects?.tier3);
            powerRollTiers = [
              { label: "!", effect: t1, tierNum: 1 },
              { label: "@", effect: t2, tierNum: 2 },
              { label: "#", effect: t3, tierNum: 3 },
            ].filter(t => t.effect);
          } catch {}
        }

        abilityDetails = {
          flavor:        flavor || null,
          powerRollLine,
          powerRollTiers,
          hasPowerResult: !!(powerRollLine || powerRollTiers.length),
          beforeEffect:  cardContext.enrichedBeforeEffect || null,
          afterEffect:   cardContext.enrichedAfterEffect  || null,
        };
      } else {
        const before = sys.effect?.before ?? "";
        const after  = sys.effect?.after  ?? "";
        const parts  = [before, after].filter(s => s.trim());
        const raw    = parts.join("<hr>");
        if (raw) {
          try {
            descriptionHtml = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
              raw, { async: true, relativeTo: item }
            );
          } catch { descriptionHtml = raw; }
        }
      }
    } else {
      const raw = sys.description?.value ?? "";
      if (raw) {
        try {
          descriptionHtml = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            raw, { async: true, relativeTo: item }
          );
        } catch { descriptionHtml = raw; }
      }
    }

    // --- Build HTML mirroring DS Plus item-tooltip.hbs ---
    const badgesHtml = headerBadges.length ? `
      <div class="header-badges">
        ${headerBadges.map(b => `
          <div class="metadata-item header-badge">
            <span class="label">${b.label}</span>
            <span class="value">${b.value}</span>
          </div>`).join("")}
      </div>` : "";

    const metaHtml = metadata.length ? `
      <div class="bottom">
        ${metadata.map(m => `
          <div class="metadata-item">
            <span class="label">${m.label}</span>
            <span class="value">${m.value}</span>
          </div>`).join("")}
      </div>` : "";

    let bodyHtml = "";
    if (abilityDetails) {
      const flavorHtml  = abilityDetails.flavor  ? `<p class="flavor">${abilityDetails.flavor}</p>` : "";
      const prLineHtml  = abilityDetails.powerRollLine ? `<p class="power-roll-line"><strong>${abilityDetails.powerRollLine}</strong></p>` : "";
      const tiersHtml   = abilityDetails.powerRollTiers.length ? `
        <dl class="power-roll-display">
          ${abilityDetails.powerRollTiers.map(t => `
            <dt class="tier${t.tierNum}">${t.label}</dt>
            <dd class="tier${t.tierNum}">${t.effect}</dd>`).join("")}
        </dl>` : "";
      const powerSection = (prLineHtml || tiersHtml) ? `<section class="power-result">${prLineHtml}${tiersHtml}</section>` : "";
      const beforeHtml  = abilityDetails.beforeEffect ? `
        <section class="effect before"><dl><dt>Effect</dt><dd>${abilityDetails.beforeEffect}</dd></dl></section>` : "";
      const afterHtml   = abilityDetails.afterEffect  ? `
        <section class="effect after"><dl><dt>Effect</dt><dd>${abilityDetails.afterEffect}</dd></dl></section>` : "";
      bodyHtml = `<section class="ability-details">${flavorHtml}${powerSection}${beforeHtml}${afterHtml}</section>`;
    } else if (descriptionHtml) {
      bodyHtml = `<section class="description">${descriptionHtml}</section>`;
    }

    const pillsHtml = pills.length ? `
      <ul class="pills">
        ${pills.map(p => `<li class="pill"><span class="label">${p}</span></li>`).join("")}
      </ul>` : "";

    const typeLabel = game.i18n.localize(CONFIG.Item.typeLabels?.[type] ?? type);

    tt.className = "dsp-tooltip item-tooltip dsahud-fallback-tooltip";
    tt.innerHTML = `
      <section class="content">
        <section class="header">
          <div class="top">
            <img src="${item.img}" alt="${item.name}" />
            <div class="name name-stacked">
              <span class="title">${item.name}</span>
              <span class="subtitle">${typeLabel}</span>
            </div>
            ${badgesHtml}
          </div>
          ${metaHtml}
        </section>
        ${bodyHtml}
        ${pillsHtml}
      </section>
    `;

    // Position to the right of the popup, vertically near the hovered row
    tt.style.left = "";
    tt.style.top  = "";
    tt.classList.add("visible");

    const popup     = actionEl.closest(".dsahud-popup");
    const popupRect = popup?.getBoundingClientRect();
    const rowRect   = actionEl.getBoundingClientRect();
    const gap       = 8;

    let left = popupRect ? popupRect.right + gap : rowRect.right + gap;
    const ttWidth = tt.offsetWidth;
    if (left + ttWidth > window.innerWidth - 8) {
      left = (popupRect ? popupRect.left : rowRect.left) - ttWidth - gap;
    }

    let top = rowRect.top;
    const ttHeight = tt.offsetHeight;
    if (top + ttHeight > window.innerHeight - 8) top = window.innerHeight - ttHeight - 8;
    if (top < 8) top = 8;

    tt.style.left = left + "px";
    tt.style.top  = top  + "px";
  }

  #hideTooltip() {
    document.getElementById("dsahud-tooltip")?.classList.remove("visible");
  }

  #scheduleClose(html) {
    this.#cancelClose();
    this.#closeTimer = setTimeout(() => {
      html.find(".dsahud-popup.active").removeClass("active");
    }, 200);
  }

  #cancelClose() {
    if (this.#closeTimer) {
      clearTimeout(this.#closeTimer);
      this.#closeTimer = null;
    }
  }

  /** After render, size and align the bar to the Foundry hotbar. */
  async _render(force, options) {
    await super._render(force, options);
    requestAnimationFrame(() => this.#alignToHotbar());

    // Register resize listener once
    if (!this.#resizeHandler) {
      this.#resizeHandler = () => this.#alignToHotbar();
      window.addEventListener("resize", this.#resizeHandler);
    }

    // Re-align when the sidebar collapses/expands — hotbar shifts after the CSS transition (~300ms)
    if (!this.#sidebarHookIds.length) {
      const realign = () => setTimeout(() => this.#alignToHotbar(), 320);
      this.#sidebarHookIds.push(
        { event: "collapseSidebar", id: Hooks.on("collapseSidebar", realign) },
        { event: "renderSidebar",   id: Hooks.on("renderSidebar",   realign) },
      );
    }
  }

  #alignToHotbar() {
    const hotbar = document.getElementById("hotbar");
    if (!hotbar) return;
    const el = this.element?.[0];
    const bar = el?.querySelector(".dsahud-bar");
    if (!el || !bar) return;

    const slots = hotbar.querySelectorAll("li.macro-slot, .macro-slot, li[data-slot]");
    const hRect = hotbar.getBoundingClientRect();

    if (slots.length < 2) {
      // Fallback: match full hotbar
      bar.style.flexWrap = "nowrap";
      el.style.left   = hRect.left + "px";
      el.style.width  = hRect.width + "px";
      el.style.bottom = (window.innerHeight - hRect.top + 6) + "px";
      return;
    }

    const rects = Array.from(slots).map(s => s.getBoundingClientRect());
    const firstTop = rects[0].top;
    const isWrapped = rects[rects.length - 1].top > firstTop + 4;

    if (isWrapped) {
      // Find where row 2 starts
      const row1Rects = rects.filter(r => r.top <= firstTop + 4);
      const row2Rects = rects.filter(r => r.top > firstTop + 4);

      const row1Left  = row1Rects[0].left;
      const row1Right = row1Rects[row1Rects.length - 1].right;
      const row2Left  = row2Rects[0].left;
      const row2Right = row2Rects[row2Rects.length - 1].right;

      // Use the wider row's span, align left to leftmost slot
      const left  = Math.min(row1Left, row2Left);
      const width = Math.max(row1Right, row2Right) - left;

      bar.style.flexWrap = "wrap";
      el.style.left   = left + "px";
      el.style.width  = width + "px";
      el.style.bottom = (window.innerHeight - hRect.top + 6) + "px";
    } else {
      bar.style.flexWrap = "nowrap";
      el.style.left   = rects[0].left + "px";
      el.style.width  = (rects[rects.length - 1].right - rects[0].left) + "px";
      el.style.bottom = (window.innerHeight - hRect.top + 6) + "px";
    }
  }

  /** External refresh trigger — debounced re-render. */
  refresh() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => this.render(false), 50);
  }

  async close(options = {}) {
    this.#hideTooltip();
    if (this.#resizeHandler) {
      window.removeEventListener("resize", this.#resizeHandler);
      this.#resizeHandler = null;
    }
    for (const { event, id } of this.#sidebarHookIds) Hooks.off(event, id);
    this.#sidebarHookIds = [];
    return super.close(options);
  }
}
