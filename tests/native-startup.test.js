import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";
import startupCommands from "../src/index.js";

test("native Pi startup runs commands after target initialization without a model request", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-native-startup-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  let session;
  t.after(() => {
    session?.dispose();
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    rmSync(dir, { recursive: true, force: true });
  });
  writeFileSync(join(dir, "startup-commands.json"), JSON.stringify({ commands: ["/fixture-limit 300k"] }));

  let limit = "unset";
  let modelRequests = 0;
  const notices = [];
  const errors = [];
  const targetExtension = (pi) => {
    pi.on("session_start", () => { limit = "reset by target startup"; });
    pi.registerCommand("fixture-limit", { description: "Set the fixture limit", handler: (args) => { limit = args; } });
  };
  const settingsManager = SettingsManager.inMemory({ packages: [] });
  const resourceLoader = new DefaultResourceLoader({
    cwd: dir, agentDir: dir, settingsManager,
    extensionFactories: [startupCommands, targetExtension],
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await resourceLoader.reload();
  assert.deepEqual(resourceLoader.getExtensions().errors, []);
  ({ session } = await createAgentSession({
    cwd: dir, agentDir: dir, settingsManager, resourceLoader,
    sessionManager: SessionManager.inMemory(dir),
  }));
  session.agent.streamFunction = () => {
    modelRequests++;
    throw new Error("startup command reached a model");
  };
  await session.bindExtensions({
    mode: "tui",
    uiContext: { notify: (message) => notices.push(message), setStatus() {} },
    onError: (error) => errors.push(error),
  });
  assert.equal(limit, "300k");
  assert.equal(modelRequests, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(notices, []);
});
