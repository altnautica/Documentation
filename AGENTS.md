# AGENTS.md - ADOS Documentation

Agentic writing instructions for the ADOS documentation site.

## Purpose

Work in this repository as a documentation agent for public ADOS setup, APIs,
operator workflows, developer guides, troubleshooting, and extension authoring.
Keep pages task-oriented, technically precise, and aligned with released
behavior.

## Read First

- Check `git status --short` before edits and preserve unrelated changes.
- Inspect nearby pages and `docs.json` before adding or moving pages.
- Keep navigation and page paths in sync.
- Prefer tested commands, concrete workflows, and supported behavior.
- If source repos disagree with docs, verify against the current code before
  changing public instructions.

## Stack and Commands

- Mintlify documentation site.
- Content is Markdown or MDX.
- Navigation lives in `docs.json`.
- Local development:

```bash
mintlify dev
```

- Validation:

```bash
mintlify broken-links
```

If validation is blocked by an unrelated MDX parse error, report the blocker and
do not claim full validation success.

## Documentation Map

- Navigation: `docs.json`
- Getting started: `getting-started/`
- Mission Control docs: `mission-control/`
- Drone Agent docs: `drone-agent/`
- Ground Agent docs: `ground-agent/`
- Architecture docs: `architecture/`
- Developer guides: `developers/`
- Extension docs: plugin and extension authoring pages under the relevant
  developer sections.

When adding a page, add the MDX file and the matching `docs.json` navigation
entry in the same change.

## Writing Rules

- Write for developers, operators, and integrators.
- Keep docs technical and task-oriented: setup, API behavior, configuration,
  troubleshooting, hardware interfaces, plugin development, and contribution
  workflows.
- Prefer concrete steps and tested commands over promotional language.
- Keep product names consistent: ADOS Mission Control, ADOS Drone Agent, ADOS
  Ground Agent, ADOS Android GCS, and ADOS plugins.
- Prefer released behavior and clearly supported workflows over speculative
  roadmap material.
- Use capability-level wording for implementation details that users do not
  need in order to run or integrate the product.
- Code examples should use neutral placeholder values and globally recognizable
  sample coordinates or hostnames.
- Keep API paths, command names, config keys, and response fields exact.

## Working in the Open

This is a public, open-source repository. Every commit, diff, and branch is
visible the moment it is pushed and stays in history permanently, so a mistake
cannot be un-published by deleting it later. Review what a change actually
contains before committing.

- **Never commit secrets.** API keys, tokens, deploy keys, passwords, private
  certificates, and `.env` files stay out of the tree. Generated secrets belong
  only in gitignored files. If a secret does land in a commit, treat it as
  compromised and rotate it.
- **Never commit real deployment detail.** Hostnames, IP addresses, tunnel
  names, device identifiers, and account names from a live setup are an attack
  surface. Use placeholders such as `example-oem`, `cloud.example.com`,
  `192.168.1.50`, and `mycompany-fleet`.
- **Never commit other people's data.** Personal names, email addresses,
  customer or employer names, real flight logs and GPS traces, and raw log
  dumps that contain any of the above do not belong in a public repository.
- **Examples are published too.** Sample commands, coordinates, hostnames, and
  screenshots get the same care as prose.
- **Respect licensing when bringing in outside code.** Third-party source is
  vendored into a vendor directory with its license intact and is never pasted
  into our own modules.
- **Keep contributions technical.** Architecture, APIs, commands, schemas,
  configuration, hardware interfaces, deployment, and troubleshooting.
  Commercial, pricing, or roadmap commentary does not belong in the codebase.
- **Comments, log strings, commit messages, and PR titles are public too.** Keep
  them bland, factual, and technical.

## Verification

- Page content change: re-read the rendered flow for command accuracy,
  placeholders, links, and headings.
- Navigation change: verify the page exists and is listed in `docs.json` exactly
  once.
- API, CLI, or config docs: verify against the current source repo or generated
  API where practical.
- Broad docs change: run `mintlify broken-links`.

Before finalizing, run `git diff --check` and report any skipped checks.

## Review Expectations

When reviewing, list findings first and focus on incorrect commands, stale API
paths, unsupported behavior, broken navigation, missing troubleshooting,
ambiguous setup steps, unsafe operator guidance, and examples that would fail
when pasted. Cite file and line references.

For implementation work, keep docs changes tied to released behavior or clearly
marked support status.

## Cross-Repo Impact

- Mission Control UI, setup, command, simulation, plugin host, and desktop
  changes may require docs updates.
- Drone Agent API, CLI, service, installer, config, and ground-node behavior
  changes may require docs updates.
- Android GCS setup and operator workflow changes may require docs updates.
- Extension manifest, packaging, permission, or authoring changes may require
  docs updates.

## Related Public Projects

- [ADOS Mission Control](https://github.com/altnautica/ADOSMissionControl) -
  browser ground control station documented by this site.
- [ADOS Drone Agent](https://github.com/altnautica/ADOSDroneAgent) - companion
  and ground-node agent documented by this site.
- [ADOS Android GCS](https://github.com/altnautica/ADOSAndroidGCS) - native
  Android ground control station.
- [ADOSExtensions](https://github.com/altnautica/ADOSExtensions) - plugin
  extensions documented by the developer guides.
