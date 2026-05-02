# AGENTS.md - ADOS Documentation

Agentic writing instructions for the ADOS documentation site.

## Stack and Commands

- Mintlify documentation site.
- Content is Markdown or MDX.
- Local development:

```bash
mintlify dev
```

Navigation lives in `docs.json`. Keep page paths and navigation entries in
sync.

## Writing Guidelines

- Write for developers, operators, and integrators.
- Keep docs technical and task-oriented: setup, API behavior, configuration,
  troubleshooting, hardware interfaces, plugin development, and contribution
  workflows.
- Prefer concrete steps and tested commands over marketing language.
- Keep product names consistent: ADOS Mission Control, ADOS Drone Agent, ADOS
  Ground Agent, and ADOS plugins.
- Prefer released behavior and clearly supported workflows over speculative
  roadmap material.
- Use capability-level wording for implementation details that users do not
  need in order to run or integrate the product.
- Code examples should use neutral placeholder values and globally recognizable
  sample coordinates or hostnames.

## Repository Boundary

Keep documentation self-contained and technical. Document product behavior,
setup, APIs, commands, configuration, hardware interfaces, deployment, and
operator workflows. Keep this repository self-contained. Describe integrations
through documented APIs, package names, public protocols, and public project
links.

## Related Public Projects

- [ADOS Mission Control](https://github.com/altnautica/ADOSMissionControl) -
  browser ground control station documented by this site.
- [ADOS Drone Agent](https://github.com/altnautica/ADOSDroneAgent) - companion
  and ground-node agent documented by this site.
- [ADOS Android GCS](https://github.com/altnautica/ADOSAndroidGCS) - native
  Android ground control station.
- [ADOSExtensions](https://github.com/altnautica/ADOSExtensions) - plugin
  extensions documented by the developer guides.
