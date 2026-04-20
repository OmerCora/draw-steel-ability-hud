/**
 * Handle all click actions from the HUD.
 * Left click = use/roll, Right click = share description to chat.
 * @param {Actor} actor
 * @param {string} actionType
 * @param {string} actionId
 * @param {object} [options]
 * @param {boolean} [options.isRightClick]
 */
export async function handleAction(actor, actionType, actionId, { isRightClick = false } = {}) {
  switch (actionType) {

    /* ---- Abilities (on the actor) ---- */
    case "ability": {
      const item = actor.items.get(actionId);
      if (!item) return;
      if (isRightClick) {
        await shareItemToChat(actor, item);
      } else {
        await item.system.use();
      }
      break;
    }

    /* ---- Compendium abilities (generic / homebrew) ---- */
    case "compendiumAbility": {
      const doc = await fromUuid(actionId);
      if (!doc) return;
      if (isRightClick) {
        await shareItemToChat(actor, doc);
      } else {
        // If the ability has a power roll, use it via the actor
        // First check if the actor already owns it; if not, use from compendium
        const owned = actor.items.find(i => i.getFlag("core", "sourceId") === actionId || i.system._dsid === doc.system._dsid);
        if (owned) {
          await owned.system.use();
        } else {
          await shareItemToChat(actor, doc);
        }
      }
      break;
    }

    /* ---- Print feature / treasure description to chat ---- */
    case "feature": {
      const item = actor.items.get(actionId);
      if (!item) return;
      await shareItemToChat(actor, item);
      break;
    }

    /* ---- NPC Free Strike (system-level performFreeStrike) ---- */
    case "npcFreeStrike": {
      if (typeof actor.system.performFreeStrike === "function") {
        await actor.system.performFreeStrike();
      }
      break;
    }

    /* ---- Characteristic roll ---- */
    case "characteristic": {
      await actor.rollCharacteristic(actionId);
      break;
    }

    /* ---- Spend recovery ---- */
    case "recovery": {
      await actor.system.spendRecovery();
      break;
    }

    /* ---- Hero token → regain stamina ---- */
    case "heroTokenRecovery": {
      await actor.system.spendStaminaHeroToken();
      break;
    }

    /* ---- Gain surges from hero tokens ---- */
    case "gainSurges": {
      const SheetClass = CONFIG.Actor.sheetClasses.hero?.["draw-steel.DrawSteelHeroSheet"]?.cls;
      const fn = SheetClass?.DEFAULT_OPTIONS?.actions?.gainSurges;
      if (fn) await fn.call(actor.sheet, null, null);
      break;
    }

    /* ---- Damage Surge (1/2/3) ---- */
    case "damageSurge":
    case "damageSurge2":
    case "damageSurge3": {
      const countMap = { damageSurge: 1, damageSurge2: 2, damageSurge3: 3 };
      const count = countMap[actionType] ?? 1;
      await spendDamageSurge(actor, count);
      break;
    }

    /* ---- Potency Surge (2) ---- */
    case "potencySurge": {
      await spendPotencySurge(actor);
      break;
    }
  }
}

/* ================================================================
 *  Surge helpers (mirrored from draw-steel-resources-ui)
 * ================================================================ */

async function spendDamageSurge(actor, count) {
  const current = actor.system.hero?.surges ?? 0;
  if (current < count) {
    ui.notifications.warn(game.i18n.localize("DSAHUD.Notify.NoSurges"));
    return;
  }

  const chars = actor.system?.characteristics ?? {};
  let highestChar = 0;
  for (const key of Object.keys(chars)) {
    const val = Number(chars[key]?.value ?? 0);
    if (val > highestChar) highestChar = val;
  }

  const totalDamage = highestChar * count;
  const newSurges = current - count;
  await actor.update({ "system.hero.surges": newSurges });

  const damageEnricher = `[[/damage ${totalDamage}]]`;
  const enriched = await TextEditor.enrichHTML(damageEnricher, { rollData: actor.getRollData(), async: true });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<h3>Damage Surge (×${count})</h3>
      <p>Spent <strong>${count}</strong> surge${count > 1 ? "s" : ""}.</p>
      <p>${count} × ${highestChar} = ${enriched}</p>
      <p>Surges remaining: ${newSurges}</p>`,
  });
}

async function spendPotencySurge(actor) {
  const current = actor.system.hero?.surges ?? 0;
  if (current < 2) {
    ui.notifications.warn(game.i18n.localize("DSAHUD.Notify.NoSurges"));
    return;
  }

  const newSurges = current - 2;
  await actor.update({ "system.hero.surges": newSurges });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<h3>Potency Surge</h3>
      <p>Spent <strong>2</strong> surges to increase potency by 1 for one target.</p>
      <p>Surges remaining: ${newSurges}</p>`,
  });
}

/* ================================================================
 *  Share item description to chat
 * ================================================================ */

async function shareItemToChat(actor, item) {
  // Use toEmbed if available (abilities), otherwise use description
  let html;
  if (typeof item.system.toEmbed === "function") {
    const content = await item.system.toEmbed({});
    html = content.outerHTML;
  } else {
    const desc = item.system.description?.value ?? "";
    html = await TextEditor.enrichHTML(desc, { rollData: actor.getRollData(), async: true });
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<h3>${item.name}</h3>${html}`,
  });
}
