# pi-startup-commands

Run configured Pi extension commands when an interactive session starts or extensions reload.

For example, set `max-context` to 300k automatically while keeping its code unchanged.

## Install

Requires Pi 1.4.0 or later and Node.js 22.19 or later.

```sh
pi install git:github.com/uuie/pi-startup-commands@v0.1.0
```

After the npm release is published, the package can also be installed with:

```sh
pi install npm:pi-startup-commands
```

Create `~/.pi/agent/startup-commands.json`:

```json
{
  "commands": [
    "/max-context 300k"
  ]
}
```

Restart Pi or run `/reload`, then run `/max-context` to verify the limit.
Install `max-context` separately with `pi install npm:max-context` when using this example.

Pi's `PI_CODING_AGENT_DIR` override also controls where this extension reads its configuration.
A missing file or an empty `commands` array leaves startup unchanged.

## Behavior

| Event | Action |
| --- | --- |
| Interactive startup | Read the file and dispatch configured commands |
| `/reload` | Reread the file and dispatch configured commands |
| New, resumed or forked session | Keep the current runtime settings |
| RPC or print mode | Leave startup unchanged |

Commands must be registered extension commands, such as `/max-context` or `/ponytail`.
The entire list is validated before dispatch. Unknown commands, skills, prompt templates,
plain prompts and multiline values are rejected, so a typo cannot become a model prompt.

Commands are dispatched in the listed order through Pi's public command-expansion API.
Dispatch waits until all extensions have finished their `session_start` handlers.
Each command owns its asynchronous work and error reporting.

Configuration errors appear as a Pi notification. Configuration contents are omitted from errors.
The extension does not create configuration files or modify other extensions.

## Development

```sh
npm install --ignore-scripts
npm run build
npm test
npm pack --dry-run
```

The only peer dependency is the Pi host API. No runtime dependencies are bundled.

## License

MIT.
