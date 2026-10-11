# ADOS Platform Documentation

Documentation for the ADOS open-source drone platform, powered by [Mintlify](https://mintlify.com).

## Products covered

- **[ADOS Mission Control](https://github.com/altnautica/ADOSMissionControl)** - Ground control station for the browser and the desktop
- **[ADOS Drone Agent](https://github.com/altnautica/ADOSDroneAgent)** - Companion computer software for drones
- **ADOS Ground Agent** - Ground station software (the Drone Agent codebase with the ground station profile)
- **[ADOS Android GCS](https://github.com/altnautica/ADOSAndroidGCS)** - Ground control station for Android phones and tablets
- **[ADOS Extensions](https://github.com/altnautica/ADOSExtensions)** - First-party extensions and the plugin SDK
- **[ADOS MCP server](https://github.com/altnautica/ADOS-MCP)** - Model Context Protocol server for AI control of a fleet

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
The ADOS software it documents is licensed under [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).
