# Septopus World

* [Septopus](https://septopus.xyz) virtual world project is at [Launch Period](https://septopus.xyz/declaration#launch-period) 2025.6.19 00:00 ~ 2027.6.18 23:59.

## Goal

* Verify Identity in Septopus World. User can mint a block of Septopus World to be the participant.
* On-chain virtual world can keep everything on the table. Easy to explorer Septopus.

## Demo

* 3D Engine Demo: [https://world.septopus.xyz](https://world.septopus.xyz)
* Latest release (GitHub Pages, auto-deployed on every version tag): [https://septopus-rex.github.io/world/](https://septopus-rex.github.io/world/) — see [Releases](https://github.com/septopus-rex/world/releases) / [CHANGELOG](CHANGELOG.md) for what each version ships.
* Contract: [https://solscan.io/account/4uJZCdH5RjJrSiRxVSkYqy3MUWBCFR3BxLXUcoKQkEr2?cluster=devnet](https://solscan.io/account/4uJZCdH5RjJrSiRxVSkYqy3MUWBCFR3BxLXUcoKQkEr2?cluster=devnet)

## Core Protocol

Septopus World is built upon the **String Particle Protocol (SPP)**, a semantic space protocol for AI-native 3D world generation and optimization.

The core specification is maintained independently at [@ff13dfly/spp-protocol](https://github.com/ff13dfly/spp-protocol) and is formally licensed for use within the Septopus open-source project.

## Documentation

Three tiers — pick the right one:

| Tier | Where | What it answers |
|---|---|---|
| **Protocol (normative, bilingual cn/en)** | [`protocol/`](protocol/README.md) | The cross-engine, pure-data 3D world contract: block raw, all 18 adjunct slot maps, trigger/action vocabulary, determinism pins & conformance |
| **Reference implementation** | [`docs/`](docs/README.md) | How this TypeScript engine implements it (architecture, systems, guides) |
| **Process (non-normative)** | [`docs/plan/`](docs/plan/) | Roadmap + implementation specs |

Release history: [CHANGELOG.md](CHANGELOG.md) · Releasing & deployment: [deploy/RELEASE.md](deploy/RELEASE.md)

## Roadmap

### Step1 ( 6 month ): Devnet version Septopus World

* Contract part ( Sonana ) : world functions, block functions, resource functions, complain functions.
* Storage: resource file on IFPS
* Engine: 3D Render functions, FPV controller, Block functions ( browse and edit ), Sky System, Time System.

### Step2 ( 15 month ): Content for Septopus World

* Infrastructure of Septopus will be launched in virtual world. Different from the old Web2.0/Web2.5 way. Rule Center, King Center, AI center and dApps are put into virtual world. 
* Improve and fix bugs of program.
* Rule functions can be tested.
* King functions can be tested.
* AI for Septopus can be tested.

### Step3 ( 3 month ): Septopus World On Line

* Septopus World will run smoothly on chain.
* Rule center on chain.
* King Center on chian.
* AI Center on chain.
* Selection of King start.
## License

* **Code**: Licensed under the [MIT License](LICENSE).
* **Documentation**: Licensed under the [Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](docs/LICENSE).
