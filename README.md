# Draw Steel - Ability HUD

A Foundry VTT module for the [Draw Steel](https://mcdmproductions.com) system that provides a fixed hotbar-style HUD above the Foundry macro bar showing the selected token's abilities, features, and actions with hover popup menus.

## Summary

Ability HUD gives players and Directors instant access to a token's full ability set without opening the character sheet. Hovering a button opens a popup with all abilities in that category — click to roll, right-click to post to chat.

## Features

### Hero Buttons
- **⚔️ Main Action**: Signature, Heroic, and Epic abilities; Basic Abilities from compendium
- **🤸 Maneuver**: Special, Free, and Basic maneuvers; Homebrew maneuvers
- **⚡ Triggered Action**: Triggered and Free Triggered abilities
- **🧪 Items**: Consumables, Trinkets, and Leveled items
- **📊 Characteristics**: Roll any characteristic test; Spend Recovery; Gain Surges; Use Hero Tokens
- **📋 Features**: All feature items on the actor

### NPC / Monster Buttons
- **⚔️ Main Action**: Signature abilities, Malice abilities, Free Strike
- **🤸 Maneuver**: Maneuver abilities
- **⚡ Triggered Action**: Triggered abilities
- **☠️ Monster**: Characteristics, Malice (type:none), Villain Actions
- **📋 Features**: Feature items

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

- **Draw Steel Plus** — When active, tooltips use DS Plus's rich rendering automatically. No configuration needed.

## License

Module code is licensed under [MIT](LICENSE).

This module uses content from *Draw Steel: Heroes* (ISBN: 978-1-7375124-7-9) under the [DRAW STEEL Creator License](https://mcdm.gg/DS-license).

## Support

If you find this module useful, consider supporting development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/omercora)
