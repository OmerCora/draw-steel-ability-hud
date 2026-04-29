import { MODULE_ID } from "./config.mjs";
import { handleAction } from "./actions.mjs";
import { buildMainActionData, buildManeuverData, buildTriggeredData, buildNoActionData, buildFavoritesData, buildCharacterData, buildItemsData, buildFeaturesData, buildMaliceData, buildVillainActionData, buildMonsterData } from "./data-builder.mjs";

/**
 * Fixed HUD bar rendered above the Foundry hotbar.
 * Shows 6 buttons for the selected token; hover opens a popup menu.
 */
export class AbilityHud extends Application {
  /** @type {ReturnType<typeof setTimeout>|null} */
  #closeTimer = null;
  #resizeHandler = null;
  #mutationObserver = null;
  #resizeObserver = null;

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
    if (!actor || !["hero", "npc", "retainer"].includes(actor.type)) {
      return { hasActor: false, buttons: [] };
    }

    const buttons = [];
    const dspFavoritesEnabled = (game.modules.get("draw-steel-plus")?.active ?? false)
      && (game.settings.get(MODULE_ID, "showFavoritesButton") ?? false);

    if (actor.type === "hero") {
      const noActionSections = await buildNoActionData(actor);
      if (dspFavoritesEnabled) {
        const favSections = await buildFavoritesData(actor);
        if (favSections.length) buttons.push({ id: "favorites", label: game.i18n.localize("DSAHUD.Buttons.Favorites"), icon: "fa-solid fa-star", sections: favSections });
      }
      buttons.push(
        { id: "main-action", label: game.i18n.localize("DSAHUD.Buttons.MainAction"), icon: "fa-solid fa-sword", sections: await buildMainActionData(actor) },
        { id: "maneuver", label: game.i18n.localize("DSAHUD.Buttons.Maneuver"), icon: "fa-solid fa-person-running", sections: await buildManeuverData(actor) },
        { id: "triggered-action", label: game.i18n.localize("DSAHUD.Buttons.TriggeredAction"), icon: "fa-solid fa-bolt", sections: await buildTriggeredData(actor) },
      );
      if (noActionSections.length) {
        buttons.push({ id: "no-action", label: game.i18n.localize("DSAHUD.Buttons.NoAction"), icon: "fa-solid fa-circle-pause", sections: noActionSections });
      }
      const itemsSections = await buildItemsData(actor);
      buttons.push(
        { id: "character", label: game.i18n.localize("DSAHUD.Buttons.Character"), icon: "fa-solid fa-user", ...(await buildCharacterData(actor)) },
      );
      if (itemsSections.length) {
        buttons.push({ id: "items", label: game.i18n.localize("DSAHUD.Buttons.Items"), icon: "fa-solid fa-bag-shopping", sections: itemsSections });
      }
      buttons.push(
        { id: "features", label: game.i18n.localize("DSAHUD.Buttons.Features"), icon: "fa-solid fa-scroll", sections: await buildFeaturesData(actor) },
      );
    } else if (actor.type === "npc") {
      // NPC: show abilities grouped by type
      buttons.push(
        { id: "main-action", label: game.i18n.localize("DSAHUD.Buttons.MainAction"), icon: "fa-solid fa-sword", sections: await buildMainActionData(actor) },
        { id: "maneuver", label: game.i18n.localize("DSAHUD.Buttons.Maneuver"), icon: "fa-solid fa-person-running", sections: await buildManeuverData(actor) },
        { id: "triggered-action", label: game.i18n.localize("DSAHUD.Buttons.TriggeredAction"), icon: "fa-solid fa-bolt", sections: await buildTriggeredData(actor) },
        { id: "monster", label: game.i18n.localize("DSAHUD.Buttons.Monster"), icon: "fa-solid fa-skull", ...(await buildMonsterData(actor)) },
        { id: "features", label: game.i18n.localize("DSAHUD.Buttons.Features"), icon: "fa-solid fa-scroll", sections: await buildFeaturesData(actor) },
      );
    } else if (actor.type === "retainer") {
      // Retainer: hero-like actions, but no items button
      const noActionSections = await buildNoActionData(actor);
      if (dspFavoritesEnabled) {
        const favSections = await buildFavoritesData(actor);
        if (favSections.length) buttons.push({ id: "favorites", label: game.i18n.localize("DSAHUD.Buttons.Favorites"), icon: "fa-solid fa-star", sections: favSections });
      }
      buttons.push(
        { id: "main-action", label: game.i18n.localize("DSAHUD.Buttons.MainAction"), icon: "fa-solid fa-sword", sections: await buildMainActionData(actor) },
        { id: "maneuver", label: game.i18n.localize("DSAHUD.Buttons.Maneuver"), icon: "fa-solid fa-person-running", sections: await buildManeuverData(actor) },
        { id: "triggered-action", label: game.i18n.localize("DSAHUD.Buttons.TriggeredAction"), icon: "fa-solid fa-bolt", sections: await buildTriggeredData(actor) },
      );
      if (noActionSections.length) {
        buttons.push({ id: "no-action", label: game.i18n.localize("DSAHUD.Buttons.NoAction"), icon: "fa-solid fa-circle-pause", sections: noActionSections });
      }
      buttons.push(
        { id: "character", label: game.i18n.localize("DSAHUD.Buttons.Character"), icon: "fa-solid fa-user", ...(await buildCharacterData(actor)) },
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

    // Toggle condition buttons
    html.find(".dsahud-condition-btn").on("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const actor = this.#getActor();
      if (!actor) return;
      const conditionId = ev.currentTarget.dataset.actionId;
      await handleAction(actor, "toggleCondition", conditionId, {});
      await this.render(false);
    });

    // Resource panel buttons (draw-steel-resources-ui cross-module)
    // Trap ALL clicks/mousedowns inside the resources panel so the character popup
    // stays open even when the user clicks on description text, enriched links,
    // or anywhere not bound to a specific action.
    html.find('.dsahud-resources-panel').on('mousedown click', (ev) => {
      ev.stopPropagation();
      this._keepCharOpen = true;
      this.#cancelClose();
    });

    // Clear the sticky flag when the mouse leaves the popup entirely
    // (so normal hover-to-close behavior resumes once user moves away).
    html.find('.dsahud-button[data-button-id="character"] .dsahud-popup').on('mouseleave', () => {
      this._keepCharOpen = false;
    });

    html.find("[data-resource-action]").on("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const resModule = game.modules.get("draw-steel-resources-ui");
      if (!resModule?.api) return;
      const actor = this.#getActor();
      if (!actor) return;
      const action = ev.currentTarget.dataset.resourceAction;
      const api = resModule.api;

      // Mark popup sticky so the upcoming re-render keeps it open.
      this._keepCharOpen = true;

      if (action === "increment") {
        const current = actor.system.hero?.primary?.value ?? 0;
        await actor.update({ "system.hero.primary.value": current + 1 });
        await this.render(false);
      } else if (action === "decrement") {
        const current = actor.system.hero?.primary?.value ?? 0;
        // Respect allowNegative (e.g. Clarity can go negative to -(1 + Reason))
        const tabData = await api.buildHeroicTabData(actor);
        const allowNeg = tabData?.classFeature?.allowNegative ?? false;
        const minValue = allowNeg
          ? -(1 + (actor.getRollData?.()?.characteristics?.reason?.value ?? 0))
          : 0;
        const next = Math.max(minValue, current - 1);
        if (next !== current) await actor.update({ "system.hero.primary.value": next });
        await this.render(false);
      } else if (action === "gain") {
        const gainId = ev.currentTarget.dataset.gainId;
        if (!gainId) return;
        await api.executeGainHeroic(actor, gainId);
        await this.render(false);
      } else if (action === "spend") {
        const spendId = ev.currentTarget.dataset.spendId;
        if (!spendId) return;
        await api.executeSpendHeroic(actor, spendId);
        await this.render(false);
      } else if (action === "confirmSpendX") {
        const spendId = ev.currentTarget.dataset.spendId;
        if (!spendId) return;
        const row = ev.currentTarget.closest(".dsahud-res-spendx");
        const valueSpan = row?.querySelector(".dsahud-res-spendx-value");
        const amount = parseInt(valueSpan?.textContent ?? "1", 10) || 1;
        await api.executeConfirmSpendX(actor, spendId, amount);
        await this.render(false);
      } else if (action === "adjustSpendX") {
        // Adjust inline spendX counter without re-render — just bump the value in the DOM
        const spendId = ev.currentTarget.dataset.spendId;
        const direction = Number(ev.currentTarget.dataset.direction) || 0;
        if (!spendId || !direction) return;
        const row = ev.currentTarget.closest(".dsahud-res-spendx");
        const valueSpan = row?.querySelector(".dsahud-res-spendx-value");
        if (!valueSpan) return;
        const current = parseInt(valueSpan.textContent ?? "1", 10) || 1;
        const data = await api.buildHeroicTabData(actor);
        const entry = data?.spends?.find(s => s.id === spendId);
        if (!entry) return;
        const newVal = Math.max(entry.spendXMin ?? 1, Math.min(entry.spendXMax ?? current, current + direction * (entry.spendXStep ?? 1)));
        valueSpan.textContent = String(newVal);
      } else if (action === "undo") {
        const trackKey = ev.currentTarget.dataset.trackKey;
        if (!trackKey) return;
        await api.undoEntry(actor, trackKey);
        await this.render(false);
      } else if (action === "mindRecovery") {
        await api.executeMindRecovery(actor);
        await this.render(false);
      } else if (action === "pray") {
        await api.executePray(actor);
        await this.render(false);
      } else if (action === "strainDamage") {
        await api.executeStrainDamage(actor);
        await this.render(false);
      } else if (action === "growthSurge") {
        const ds = ev.currentTarget.dataset;
        const amount = Number(ds.surgeAmount) || 1;
        const tableLabel = ds.tableLabel ?? "";
        const trackKey = ds.trackKey || null;
        await api.executeGainGrowthSurge(actor, amount, tableLabel, trackKey);
        await this.render(false);
      }
    });

    // Editable character-panel inputs (recoveries / surges / heroic resource / stamina)
    html.find('.dsahud-char-panel').on('mousedown click', (ev) => {
      ev.stopPropagation();
      this._keepCharOpen = true;
      this.#cancelClose();
    });
    html.find('.dsahud-cp-input').on('click', (ev) => ev.stopPropagation());
    html.find('.dsahud-cp-input').on('change', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const actor = this.#getActor();
      if (!actor) return;
      const field = ev.currentTarget.dataset.cpEdit;
      const raw = ev.currentTarget.value;
      const val = Number.isFinite(parseInt(raw, 10)) ? parseInt(raw, 10) : 0;
      this._keepCharOpen = true;
      const updates = {};
      switch (field) {
        case "recoveries":     updates["system.recoveries.value"]   = Math.max(0, val); break;
        case "surges":         updates["system.hero.surges"]        = Math.max(0, val); break;
        case "heroicResource": updates["system.hero.primary.value"] = val; break;
        case "staminaValue":   updates["system.stamina.value"]      = val; break;
        case "staminaTemp":    updates["system.stamina.temporary"]  = Math.max(0, val); break;
        default: return;
      }
      await actor.update(updates);
      await this.render(false);
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
    // Preserve scroll positions of internal panels across re-renders triggered
    // by clicks (gain/spend/etc. would otherwise reset to top).
    const scrollSelectors = [".dsahud-resources-content", ".dsahud-char-panel"];
    const prevScrolls = {};
    for (const sel of scrollSelectors) {
      const el = this._element?.find(sel)?.[0];
      if (el) prevScrolls[sel] = el.scrollTop;
    }
    // Capture the previous bar position so the new (replaced) element doesn't
    // momentarily render at (0,0) before #alignToHotbar fires — that's what
    // caused the entire HUD to "jump left" on the first click.
    const oldEl = this._element?.[0];
    const prevPos = oldEl ? {
      left:   oldEl.style.left,
      width:  oldEl.style.width,
      bottom: oldEl.style.bottom,
    } : null;
    const oldBar = oldEl?.querySelector(".dsahud-bar");
    const prevBarWrap = oldBar?.style.flexWrap || "";

    await super._render(force, options);

    // Re-apply any prior inline position to the freshly-replaced element BEFORE
    // the browser paints, so there is no visible jump.
    const newEl = this._element?.[0];
    if (newEl && prevPos) {
      if (prevPos.left)   newEl.style.left   = prevPos.left;
      if (prevPos.width)  newEl.style.width  = prevPos.width;
      if (prevPos.bottom) newEl.style.bottom = prevPos.bottom;
      const newBar = newEl.querySelector(".dsahud-bar");
      if (newBar && prevBarWrap) newBar.style.flexWrap = prevBarWrap;
    }

    // Sticky character popup: any prior click in the resources/char panel sets
    // this flag so subsequent re-renders don't dismiss the popup. Re-activate
    // BEFORE restoring scroll so the panel is display:block (otherwise its
    // scrollHeight is 0 and scrollTop gets clamped back to 0).
    if (this._keepCharOpen) {
      this.#cancelClose();
      this._element?.find('.dsahud-popup.active').removeClass('active');
      this._element?.find('.dsahud-button[data-button-id="character"] .dsahud-popup').addClass('active');
    }

    // Restore scroll positions. Apply synchronously and again on the next two
    // animation frames so it sticks after layout / async content enrichment.
    const restoreScrolls = () => {
      for (const [sel, top] of Object.entries(prevScrolls)) {
        const el = this._element?.find(sel)?.[0];
        if (el && top) el.scrollTop = top;
      }
    };
    restoreScrolls();
    requestAnimationFrame(() => { restoreScrolls(); requestAnimationFrame(restoreScrolls); });

    // Only realign on the FIRST render (or when forced). Subsequent re-renders
    // triggered by data updates (e.g. resource gain/spend) must NOT recompute
    // bar position — even tiny font/icon-loading width differences cause the
    // entire HUD to visibly jump left/right when the user clicks something.
    // The window-resize, MutationObserver and ResizeObserver below handle
    // legitimate hotbar movement (dice tray, chat tray, viewport resize).
    const needsInitialAlign = force || !this._aligned;
    if (needsInitialAlign) {
      requestAnimationFrame(() => {
        this.#alignToHotbar();
        this._aligned = true;
      });
    }
    // Register resize listener once
    if (!this.#resizeHandler) {
      this.#resizeHandler = () => this.#alignToHotbar();
      window.addEventListener("resize", this.#resizeHandler);
    }

    // Re-align when the hotbar or its container changes.
    // Dice/chat trays trigger a CSS transition on #hotbar — the mutation fires at the START
    // of the transition, so we must wait for transitionend before reading getBoundingClientRect.
    const scheduleAlign = () => {
      const hb = document.getElementById("hotbar");
      if (!hb) { requestAnimationFrame(() => this.#alignToHotbar()); return; }

      // If the hotbar has a CSS transition defined, wait for it to finish.
      const durationStr = getComputedStyle(hb).transitionDuration ?? "0s";
      const maxDuration = Math.max(...durationStr.split(",").map(s => parseFloat(s) || 0));
      if (maxDuration > 0.01) {
        let fallback;
        const onEnd = () => {
          clearTimeout(fallback);
          requestAnimationFrame(() => this.#alignToHotbar());
        };
        hb.addEventListener("transitionend", onEnd, { once: true });
        // Safety fallback in case transitionend never fires
        fallback = setTimeout(() => {
          hb.removeEventListener("transitionend", onEnd);
          this.#alignToHotbar();
        }, Math.round(maxDuration * 1000) + 100);
      } else {
        requestAnimationFrame(() => this.#alignToHotbar());
      }
    };

    if (!this.#mutationObserver) {
      const hotbar   = document.getElementById("hotbar");
      const uiBottom = hotbar?.parentElement ?? document.getElementById("ui-bottom");
      this.#mutationObserver = new MutationObserver(scheduleAlign);
      if (hotbar) {
        // Watch only the hotbar's own style/class — not subtree (avoids feedback from children)
        this.#mutationObserver.observe(hotbar, { attributes: true, attributeFilter: ["style", "class"] });
      }
      if (uiBottom) {
        // Watch for tray panels being added/removed from the container
        this.#mutationObserver.observe(uiBottom, { childList: true });
      }
    }

    // ResizeObserver catches width changes not covered by style mutation (e.g. layout reflow)
    if (!this.#resizeObserver) {
      const hotbar = document.getElementById("hotbar");
      if (hotbar) {
        this.#resizeObserver = new ResizeObserver(scheduleAlign);
        this.#resizeObserver.observe(hotbar);
      }
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
    const bottom = (window.innerHeight - hRect.top + 6) + "px";

    /** Center the HUD over [refLeft, refRight] when it's wider; else left-align. */
    const applyPosition = (refLeft, refRight, wrap) => {
      const refWidth  = refRight - refLeft;
      const refCenter = (refLeft + refRight) / 2;

      // Unconstrain width so scrollWidth reflects natural content size
      el.style.width = "max-content";
      const barWidth = bar.scrollWidth; // forced layout read

      let hudLeft;
      if (barWidth > refWidth) {
        hudLeft = Math.round(refCenter - barWidth / 2);
        // Clamp so the HUD doesn't spill off-screen
        hudLeft = Math.max(4, Math.min(hudLeft, window.innerWidth - barWidth - 4));
      } else {
        hudLeft = refLeft;
      }

      bar.style.flexWrap = wrap;
      el.style.left   = hudLeft + "px";
      el.style.width  = Math.max(barWidth, refWidth) + "px";
      el.style.bottom = bottom;
    };

    if (slots.length < 2) {
      // Fallback: match full hotbar
      applyPosition(hRect.left, hRect.right, "nowrap");
      return;
    }

    const rects = Array.from(slots).map(s => s.getBoundingClientRect());
    const firstTop = rects[0].top;
    const isWrapped = rects[rects.length - 1].top > firstTop + 4;

    if (isWrapped) {
      // Find where row 2 starts
      const row1Rects = rects.filter(r => r.top <= firstTop + 4);
      const row2Rects = rects.filter(r => r.top > firstTop + 4);

      const left  = Math.min(row1Rects[0].left, row2Rects[0].left);
      const right = Math.max(row1Rects[row1Rects.length - 1].right, row2Rects[row2Rects.length - 1].right);

      applyPosition(left, right, "wrap");
    } else {
      applyPosition(rects[0].left, rects[rects.length - 1].right, "nowrap");
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
    if (this.#mutationObserver) {
      this.#mutationObserver.disconnect();
      this.#mutationObserver = null;
    }
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
    return super.close(options);
  }
}
