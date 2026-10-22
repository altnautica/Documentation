<p align="center">
  <a href="https://altnautica.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/brand/ados-lockup-dark.svg">
      <img src=".github/assets/brand/ados-lockup-light.svg" alt="ADOS" width="220">
    </picture>
  </a>
</p>
<h1 align="center">ADOS Documentation</h1>
<p align="center"><em>Guides, references and runbooks for every ADOS product, in the open alongside the code.</em></p>
<p align="center"><a href="https://creativecommons.org/publicdomain/zero/1.0/"><img src="https://img.shields.io/badge/license-CC0--1.0-blue.svg" alt="License: CC0-1.0"></a> <a href="https://mintlify.com"><img src="https://img.shields.io/badge/built%20with-Mintlify-0D9373.svg" alt="Built with Mintlify"></a> <a href="https://discord.gg/uxbvuD4d5q"><img src="https://img.shields.io/badge/Discord-join-5865F2.svg" alt="Discord"></a></p>
<p align="center">
  <strong><a href="https://github.com/altnautica/ADOSMissionControl">Mission Control</a></strong> |
  <strong><a href="https://github.com/altnautica/ADOSDroneAgent">Drone Agent</a></strong> |
  <strong><a href="https://github.com/altnautica/ADOSAndroidGCS">Android GCS</a></strong> |
  <strong><a href="https://github.com/altnautica/ADOSExtensions">Extensions</a></strong> |
  <strong><a href="https://github.com/altnautica/ADOS-MCP">MCP</a></strong> |
  <strong><a href="https://github.com/altnautica/ADOSDroneAgent/tree/main/crates#published-crates">Rust crates</a></strong> |
  <strong><a href="https://docs.altnautica.com">Docs</a></strong> |
  <strong><a href="https://altnautica.com">Website</a></strong> |
  <strong><a href="https://discord.gg/uxbvuD4d5q">Discord</a></strong>
</p>
<p align="center"><a href="https://docs.altnautica.com">Live docs</a> · <a href="#contributing-to-these-docs">Contributing</a></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/scenes/system-dark.webp">
  <img src=".github/assets/scenes/system-light.webp" alt="The ADOS system: drone, ground node and ground stations" width="100%">
</picture>

This repository is the source of [docs.altnautica.com](https://docs.altnautica.com), the documentation for the ADOS open-source drone platform. It is built with [Mintlify](https://mintlify.com).

## How ADOS fits together

```mermaid
flowchart LR
  subgraph air["On the drone"]
    FC["Flight controller<br/>ArduPilot · PX4 · Betaflight · iNav"]
    DA["ADOS Drone Agent"]
  end
  subgraph ground["On the ground"]
    GA["ADOS Ground Agent"]
    MC["ADOS Mission Control<br/>browser · desktop"]
    AG["ADOS Android GCS"]
    MCP["ADOS MCP<br/>AI clients"]
  end
  EXT["ADOS Extensions"]
  FC <-- MAVLink --> DA
  DA <-- "long-range radio link" --> GA
  MC <-- "LAN or cloud relay" --> DA
  MC <-- LAN --> GA
  AG <-- "LAN or cloud" --> DA
  MCP <-- "LAN or cloud" --> DA
  EXT -. "agent plugins" .-> DA
  EXT -. "GCS panels" .-> MC
```

ADOS Ground Agent is the Drone Agent running its ground-station profile.

| Repo | Runs on | What it does | Link |
|---|---|---|---|
| ADOS Mission Control | Browser, desktop (Electron) | Ground control station: FC setup, mission planning, flight, 3D simulation, fleet | [ADOSMissionControl](https://github.com/altnautica/ADOSMissionControl) |
| ADOS Drone Agent | Companion computer on the drone, or a ground node | Onboard agent: MAVLink routing, HD video, long-range radio link, plugins, remote control | [ADOSDroneAgent](https://github.com/altnautica/ADOSDroneAgent) |
| ADOS Android GCS | Android phones and tablets | Native ground control app for agents on the LAN, direct flight controllers and the cloud | [ADOSAndroidGCS](https://github.com/altnautica/ADOSAndroidGCS) |
| ADOS Extensions | Drone Agent and Mission Control | First-party signed plugins, each with an agent half and a GCS half | [ADOSExtensions](https://github.com/altnautica/ADOSExtensions) |
| ADOS MCP | Your machine | Model Context Protocol server that lets AI clients operate ADOS drones under scopes and a safety gate | [ADOS-MCP](https://github.com/altnautica/ADOS-MCP) |
| Documentation | docs.altnautica.com | Public docs for every ADOS product | [Documentation](https://github.com/altnautica/Documentation) |

## Local development

Install the [Mintlify CLI](https://www.npmjs.com/package/mint):

```bash
npm i -g mint
```

Run the docs locally:

```bash
mint dev
```

## Contributing to these docs

Found an error or want to improve a page? Open a pull request.

- Run `mint dev` and check the page renders before you open the pull request.
- A new page needs its MDX file and a `docs.json` navigation entry in the same change. A removed or renamed page needs a `redirects` entry in `docs.json`.
- Files under `snippets/generated/` are generated from the code repositories by `scripts/gen-reference.mjs`. Change the source, never the snippet.
- Follow the writing rules in [AGENTS.md](AGENTS.md).

Contributing to the ADOS code itself is covered in the [contributing guide](https://docs.altnautica.com/getting-started/contributing).

## License

Documentation content is dedicated to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
The ADOS software it documents is licensed under [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html); the Rust library crates are MIT OR Apache-2.0.
