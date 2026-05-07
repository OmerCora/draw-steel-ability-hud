import { MODULE_ID } from "./config.mjs";

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
      if (!item) return false;
      if (isRightClick) {
        await shareItemToChat(actor, item);
      } else {
        const result = await item.system.use();
        return result !== null;
      }
      break;
    }

    /* ---- Compendium abilities (generic / homebrew) ---- */
    case "compendiumAbility": {
      const doc = await fromUuid(actionId);
      if (!doc) return false;
      if (isRightClick) {
        await shareItemToChat(actor, doc);
      } else {
        const owned = actor.items.find(item => {
          const sourceMatches = item.getFlag("core", "sourceId") === actionId;
          const dsidMatches = !!doc.system?._dsid && item.system?._dsid === doc.system._dsid;
          return sourceMatches || dsidMatches;
        });
        const embedded = owned ?? await importCompendiumAbility(actor, doc, actionId);
        if (!embedded) return false;
        const result = await embedded.system.use();
        return result !== null;
      }
      break;
    }

    /* ---- Print feature / treasure description to chat ---- */
    case "feature": {
      const item = actor.items.get(actionId);
      if (!item) return false;
      await shareItemToChat(actor, item);
      break;
    }

    /* ---- NPC Free Strike (system-level performFreeStrike) ---- */
    case "npcFreeStrike": {
      const canUseSystemFreeStrike = actor.type !== "retainer" && typeof actor.system.performFreeStrike === "function";
      if (canUseSystemFreeStrike) {
        await actor.system.performFreeStrike();
      } else {
        const freeStrikeValue = actor.system.freeStrike?.value ?? actor.system.monster?.freeStrike ?? actor.system.retainer?.freeStrike;
        if (freeStrikeValue === undefined || freeStrikeValue === null || freeStrikeValue === "") {
          ui.notifications.warn("No free strike value found for this actor.");
          break;
        }

        const damageEnricher = `[[/damage ${freeStrikeValue}]]`;
        const enriched = await TextEditor.enrichHTML(damageEnricher, { rollData: actor.getRollData(), async: true });
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<h3>Free Strike</h3><p>${enriched}</p>`,
        });
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

    /* ---- Hero token → reroll a test ---- */
    case "heroTokenRerollTest": {
      const heroTokens = game.actors?.heroTokens;
      if (!heroTokens || heroTokens.value < 1) {
        ui.notifications.warn(game.i18n.localize("DSAHUD.Notify.NoHeroTokens") || "Not enough hero tokens!");
        break;
      }
      const result = await heroTokens.spendToken("rerollTest", { flavor: actor.name }).catch(() => null);
      if (result === false) break;
      // If the system's spendToken doesn't post a chat message for this type, post one manually
      if (result === undefined || result === null) {
        const speaker = ChatMessage.getSpeaker({ actor });
        await ChatMessage.create({
          user: game.user.id,
          speaker,
          content: `<div class="dsresources-chat-card">
            <div class="dsresources-chat-header"><strong>${speaker.alias}</strong> spent 1 Hero Token</div>
            <div class="dsresources-chat-method">${game.i18n.localize("DSAHUD.Actions.HeroTokenRerollTest")}: you must use the new roll.</div>
          </div>`,
        });
      }
      break;
    }

    /* ---- Hero token → succeed on a failed save ---- */
    case "heroTokenSucceedSave": {
      const heroTokens = game.actors?.heroTokens;
      if (!heroTokens || heroTokens.value < 1) {
        ui.notifications.warn(game.i18n.localize("DSAHUD.Notify.NoHeroTokens") || "Not enough hero tokens!");
        break;
      }
      const result = await heroTokens.spendToken("succeedSave", { flavor: actor.name }).catch(() => null);
      if (result === false) break;
      if (result === undefined || result === null) {
        const speaker = ChatMessage.getSpeaker({ actor });
        await ChatMessage.create({
          user: game.user.id,
          speaker,
          content: `<div class="dsresources-chat-card">
            <div class="dsresources-chat-header"><strong>${speaker.alias}</strong> spent 1 Hero Token</div>
            <div class="dsresources-chat-method">${game.i18n.localize("DSAHUD.Actions.HeroTokenSucceedSave")}: you succeed on the saving throw.</div>
          </div>`,
        });
      }
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

    /* ---- Toggle status condition ---- */
    case "toggleCondition": {
      await actor.toggleStatusEffect(actionId);
      break;
    }

    /* ---- Basic Malice: Brutal Effectiveness (3 Malice) ---- */
    case "brutalEffectiveness": {
      const remaining = await spendMalice(actor, 3);
      if (remaining === false) break;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<h3>Brutal Effectiveness</h3>
          <p>Spent <strong>3 Malice</strong>. The next ability the monster uses with a potency has that potency increased by 1.</p>
          <p>Malice remaining: ${remaining}</p>`,
      });
      break;
    }

    /* ---- Basic Malice: Malicious Strike (5+ Malice) ---- */
    case "maliciousStrike": {
      await showMaliciousStrikeDialog(actor);
      break;
    }
  }
  return true;
}

async function importCompendiumAbility(actor, sourceItem, sourceUuid) {
  if (sourceItem.type !== "ability") return null;
  const itemData = sourceItem.toObject();
  delete itemData._id;
  delete itemData.folder;
  itemData.flags ??= {};
  foundry.utils.setProperty(itemData, "flags.core.sourceId", sourceUuid);
  foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.importedFromHud`, true);

  try {
    const [created] = await actor.createEmbeddedDocuments("Item", [itemData], { renderSheet: false });
    return created ?? null;
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to import ability for HUD use`, error);
    ui.notifications.error(game.i18n.localize("DSAHUD.Notify.ImportAbilityFailed") || "Could not add that ability to the actor.");
    return null;
  }
}

/* ================================================================
 *  Surge helpers (mirrored from draw-steel-resources-ui)
 * ================================================================ */

async function spendDamageSurge(actor, count) {
  // Retainers spend from their mentor's surge pool
  const surgeActor = actor.type === "retainer" ? actor.system.retainer?.mentor : actor;
  if (!surgeActor) {
    ui.notifications.warn(game.i18n.localize("DSAHUD.Notify.NoMentor") || "Retainer has no mentor assigned.");
    return;
  }
  const current = surgeActor.system.hero?.surges ?? 0;
  if (current < count) {
    ui.notifications.warn(game.i18n.localize("DSAHUD.Notify.NoSurges"));
    return;
  }

  // Damage uses the surge-providing actor's characteristics (mentor for retainers)
  const chars = surgeActor.system?.characteristics ?? {};
  let highestChar = 0;
  for (const key of Object.keys(chars)) {
    const val = Number(chars[key]?.value ?? 0);
    if (val > highestChar) highestChar = val;
  }

  const totalDamage = highestChar * count;
  const newSurges = current - count;
  await surgeActor.update({ "system.hero.surges": newSurges });

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
  const surgeActor = actor.type === "retainer" ? actor.system.retainer?.mentor : actor;
  if (!surgeActor) {
    ui.notifications.warn(game.i18n.localize("DSAHUD.Notify.NoMentor") || "Retainer has no mentor assigned.");
    return;
  }
  const current = surgeActor.system.hero?.surges ?? 0;
  if (current < 2) {
    ui.notifications.warn(game.i18n.localize("DSAHUD.Notify.NoSurges"));
    return;
  }

  const newSurges = current - 2;
  await surgeActor.update({ "system.hero.surges": newSurges });

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

/* ================================================================
 *  Basic Malice helpers
 * ================================================================ */

async function showMaliciousStrikeDialog(actor) {
  const { DialogV2 } = foundry.applications.api;

  const chars = actor.system.characteristics ?? {};
  let highestChar = 0;
  for (const key of Object.keys(chars)) {
    const val = Number(chars[key]?.value ?? 0);
    if (val > highestChar) highestChar = val;
  }
  if (highestChar < 1) highestChar = 1;

  const currentMalice = game.actors.malice?.value ?? "?";
  const minMalice = 5;
  // Each additional Malice above 5 adds +1 damage; max damage = 3 × highestChar
  const maxMalice = minMalice + (3 * highestChar - highestChar); // = 5 + 2 * highestChar
  const baseDamage = highestChar;

  const content = `<div style="padding:4px 0">
    <p style="margin-bottom:8px"><em>The monster pours all their animosity into their attack. Their next strike deals extra damage to one target equal to the monster's highest characteristic (${highestChar}). The extra damage increases by 1 for each additional Malice spent (maximum ${3 * highestChar}).</em></p>
    <p><strong>Current Malice: ${currentMalice}</strong></p>
    <div style="margin:8px 0">
      <label>Malice to Spend: <span id="dsahud-ms-spend">${minMalice}</span></label><br>
      <input type="range" id="dsahud-ms-slider" min="${minMalice}" max="${maxMalice}" value="${minMalice}" step="1" style="width:100%;margin-top:4px">
    </div>
    <p>Extra Damage: <strong id="dsahud-ms-damage">${baseDamage}</strong></p>
  </div>`;

  let maliceToSpend = null;
  await DialogV2.wait({
    window: { title: "Malicious Strike (5+ Malice)" },
    position: { width: 480 },
    content,
    buttons: [
      {
        action: "ok",
        label: "Post to Chat",
        icon: "fa-solid fa-comment",
        default: true,
        callback: (event, button, dialog) => {
          const slider = dialog.element.querySelector("#dsahud-ms-slider");
          maliceToSpend = Number(slider?.value ?? minMalice);
        },
      },
      { action: "cancel", label: "Cancel" },
    ],
    render: (event, dialog) => {
      const slider = dialog.element.querySelector("#dsahud-ms-slider");
      const spendEl = dialog.element.querySelector("#dsahud-ms-spend");
      const damageEl = dialog.element.querySelector("#dsahud-ms-damage");
      if (!slider) return;
      slider.addEventListener("input", () => {
        const spend = Number(slider.value);
        if (spendEl) spendEl.textContent = spend;
        if (damageEl) damageEl.textContent = baseDamage + (spend - minMalice);
      });
    },
    rejectClose: false,
  });

  if (maliceToSpend === null) return;

  const remaining = await spendMalice(actor, maliceToSpend);
  if (remaining === false) return;

  const extraDamage = baseDamage + (maliceToSpend - minMalice);
  const damageEnricher = `[[/damage ${extraDamage}]]`;
  const enriched = await TextEditor.enrichHTML(damageEnricher, { rollData: actor.getRollData(), async: true });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<h3>Malicious Strike</h3>
      <p>Spent <strong>${maliceToSpend} Malice</strong>.</p>
      <p>Extra damage to one target: ${enriched}</p>
      <p>Malice remaining: ${remaining}</p>
      <p><em>This feature can't be used two rounds in a row, even by different monsters.</em></p>`,
  });
}

async function spendMalice(actor, amount) {
  const current = game.actors.malice?.value ?? 0;
  if (current < amount) {
    ui.notifications.warn(`Not enough Malice! (need ${amount}, have ${current})`);
    return false;
  }
  try {
    await actor.system.updateResource(-amount);
    return (game.actors.malice?.value ?? current - amount);
  } catch {
    return false;
  }
}
