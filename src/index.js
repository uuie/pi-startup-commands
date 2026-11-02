import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const CONFIG_FILE = "startup-commands.json";

export default function startupCommands(pi) {
  let pending = false;
  pi.on("session_start", (event, ctx) => {
    pending = ctx.mode === "tui" && ["startup", "reload"].includes(event.reason);
  });

  // Pi emits resource discovery after every extension's session_start handler finishes.
  pi.on("resources_discover", (_event, ctx) => {
    if (!pending) return;
    pending = false;
    if (ctx.mode !== "tui") return;

    let config;
    try {
      config = JSON.parse(readFileSync(join(getAgentDir(), CONFIG_FILE), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        ctx.ui.notify(`startup-commands: cannot read ${CONFIG_FILE} (${error?.code ?? "invalid JSON"}).`, "error");
      }
      return;
    }

    if (!Array.isArray(config?.commands) || config.commands.some((command) =>
      typeof command !== "string" || !command.trim().startsWith("/") || /[\r\n]/.test(command))) {
      ctx.ui.notify(`startup-commands: ${CONFIG_FILE} must contain a commands array of single-line slash commands.`, "error");
      return;
    }

    const available = new Set(pi.getCommands()
      .filter((command) => command.source === "extension")
      .map((command) => command.name));
    const commands = config.commands.map((command) => command.trim());
    for (const [index, command] of commands.entries()) {
      const name = command.slice(1).split(" ", 1)[0];
      if (!available.has(name)) {
        ctx.ui.notify(`startup-commands: command ${index + 1} is not a registered extension command; nothing was run.`, "error");
        return;
      }
    }

    for (const command of commands) {
      pi.sendUserMessage(command, { expandPromptTemplates: true });
    }
  });
}
