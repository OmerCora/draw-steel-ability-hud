# Draw Steel - Ability HUD

A Foundry VTT module for the [Draw Steel](https://mcdmproductions.com) system that provides a fixed hotbar-style HUD above the Foundry hotbar showing the selected token's abilities, features, and actions with hover popup menus.

## Summary

Ability HUD gives players and Directors instant access to a selected token's full ability/feature set without opening the character sheet. 
Left click to roll, right-click to post to chat. Character tab has easy access features like Ability Test, Spend Recovery, Hero Token and Surge.

<img width="810" height="386" alt="Screenshot 2026-04-20 164718" src="https://github.com/user-attachments/assets/ca57ed03-ec3b-4c7f-95f6-4977d851dbcb" />

## Features

### Hero Buttons
- **⚔️ Main Action**: Signature, Heroic, and Epic abilities; Basic Abilities from compendium
- **🤸 Maneuver**: Special, Free, and Basic maneuvers; Homebrew maneuvers
- **⚡ Triggered Action**: Triggered and Free Triggered abilities
- **🧪 Items**: Consumables, Trinkets, and Leveled items
- **📊 Characteristics**: Roll any characteristic test; Spend Recovery; Gain Surges; Use Hero Tokens
- **📋 Features**: All feature items on the actor

### NPC / Monster Buttons
- **⚔️ Main Action**: Signature abilities, Malice abilities, Free Strike (System's native Monster Free Strike)
- **🤸 Maneuver**: Maneuver abilities
- **⚡ Triggered Action**: Triggered abilities
- **☠️ Monster**: Characteristics, Malice (type:none), Villain Actions
- **📋 Features**: Feature items

<img width="793" height="497" alt="Screenshot 2026-04-20 164730" src="https://github.com/user-attachments/assets/6ae13f6f-ff78-4af2-8914-e8376b4f435f" />
<img width="283" height="600" alt="Screenshot 2026-04-20 164848" src="https://github.com/user-attachments/assets/07255f21-3d18-48ba-ae37-72c0bcc67fa5" />
<img width="273" height="458" alt="Screenshot 2026-04-20 164818" src="https://github.com/user-attachments/assets/c3c69f43-7a2a-4388-80e5-94ebdbb27f9c" />

### Hover Tooltips
- Hover any ability or feature row to see a rich tooltip to the right of the popup
- **If Draw Steel Plus is active:** uses DS Plus's own tooltip rendering for identical presentation including power roll tiers, distance/target metadata, and keyword pills
- **If Draw Steel Plus is not active:** renders a matching fallback tooltip styled identically to DS Plus
- Togglable via module settings (per-player client setting)

### Compendium Integration
- Basic Abilities pulled from the `draw-steel.abilities` compendium, configurable per-player via settings
- Homebrew maneuvers configurable by UUID via settings

## Installation

Install via Foundry VTT's module browser by searching for **"Draw Steel - Ability HUD"**, or paste the manifest URL into the Install Module dialog:

```
https://github.com/OmerCora/draw-steel-ability-hud/releases/latest/download/module.json
```

## Compatibility

| | Version |
|---|---|
| **Foundry VTT** | v13+ (verified 14.360) |
| **Draw Steel System** | v0.9.0+ (verified 1.0.0) |

## Optional Integration

- **Draw Steel Plus**: When active, tooltips use DS Plus's rich rendering automatically. No configuration needed.

<img width="685" height="535" alt="Screenshot 2026-04-20 165726" src="https://github.com/user-attachments/assets/0af13626-0122-479a-b006-dba046bb8042" />

## Limitation

- I intentionally made it fixed over the Foundry hotbar for my players. I might consider making it movable if there is enough request.

## License

Module code is licensed under [MIT](LICENSE).

This module uses content from *Draw Steel: Heroes* (ISBN: 978-1-7375124-7-9) under the [DRAW STEEL Creator License](https://mcdm.gg/DS-license).

## Support

If you find this module useful, consider supporting development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/omercora)
