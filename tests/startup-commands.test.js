import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import startupCommands from "../src/index.js";

function harness(t) {
  const dir = mkdtempSync(join(tmpdir(), "pi-startup-commands-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(() => {
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    rmSync(dir, { recursive: true, force: true });
  });
  const handlers = new Map();
  const sent = [];
  const notices = [];
  const registered = [
    { name: "max-context", source: "extension" },
    { name: "ponytail", source: "extension" },
    { name: "skill:example", source: "skill" },
    { name: "template", source: "prompt" },
  ];
  startupCommands({
    on: (event, handler) => handlers.set(event, handler),
    getCommands: () => registered,
    sendUserMessage: (text, options) => sent.push({ text, options }),
  });
  const context = (mode) => ({ mode, ui: { notify: (message, type) => notices.push({ message, type }) } });
  return {
    sent,
    notices,
    write: (config) => writeFileSync(join(dir, "startup-commands.json"), JSON.stringify(config)),
    writeRaw: (text) => writeFileSync(join(dir, "startup-commands.json"), text),
    start: (reason = "startup", mode = "tui") => handlers.get("session_start")({ type: "session_start", reason }, context(mode)),
    discover: (mode = "tui") => handlers.get("resources_discover")({ type: "resources_discover", reason: "startup" }, context(mode)),
    emit: (reason = "startup", mode = "tui") => {
      handlers.get("session_start")({ type: "session_start", reason }, context(mode));
      handlers.get("resources_discover")({ type: "resources_discover", reason }, context(mode));
    },
  };
}

test("missing configuration is quiet", (t) => {
  const h = harness(t);
  h.emit();
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.notices, []);
});

test("startup dispatches configured extension commands with command expansion", (t) => {
  const h = harness(t);
  h.write({ commands: [" /max-context 300k ", "/ponytail full"] });
  h.emit();
  assert.deepEqual(h.sent, [
    { text: "/max-context 300k", options: { expandPromptTemplates: true } },
    { text: "/ponytail full", options: { expandPromptTemplates: true } },
  ]);
  assert.deepEqual(h.notices, []);
});

test("reload rereads configuration", (t) => {
  const h = harness(t);
  h.write({ commands: ["/max-context 300k"] });
  h.emit();
  h.write({ commands: ["/max-context 400k"] });
  h.emit("reload");
  assert.deepEqual(h.sent.map((entry) => entry.text), ["/max-context 300k", "/max-context 400k"]);
});

test("commands wait for startup completion and run once per lifecycle", (t) => {
  const h = harness(t);
  h.write({ commands: ["/max-context 300k"] });
  h.discover();
  h.start();
  assert.deepEqual(h.sent, []);
  h.discover();
  h.discover();
  assert.equal(h.sent.length, 1);
});

test("session changes and headless modes preserve runtime settings", (t) => {
  const h = harness(t);
  h.write({ commands: ["/max-context 300k"] });
  for (const reason of ["new", "resume", "fork"]) h.emit(reason);
  for (const mode of ["rpc", "print"]) h.emit("startup", mode);
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.notices, []);
});

test("invalid JSON is reported without echoing its contents", (t) => {
  const h = harness(t);
  h.writeRaw('{"secret": "DO_NOT_ECHO",');
  assert.doesNotThrow(() => h.emit());
  assert.deepEqual(h.sent, []);
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].type, "error");
  assert(!h.notices[0].message.includes("DO_NOT_ECHO"));
});

test("invalid command values reject the whole batch", (t) => {
  const h = harness(t);
  for (const invalid of [null, {}, { commands: "bad" }, { commands: ["/max-context 300k", 42] },
    { commands: ["/max-context 300k", "plain prompt"] }, { commands: ["/max-context 300k\n/ponytail full"] }]) {
    h.write(invalid);
    h.emit();
  }
  assert.deepEqual(h.sent, []);
  assert.equal(h.notices.length, 6);
});

test("unknown, skill, template and malformed commands cannot become model prompts", (t) => {
  const h = harness(t);
  for (const command of ["/missing 300k", "/skill:example", "/template", "/max-context\t300k", "/"]) {
    h.write({ commands: ["/max-context 300k", command] });
    h.emit();
  }
  assert.deepEqual(h.sent, []);
  assert.equal(h.notices.length, 5);
});

test("an empty commands array disables startup actions", (t) => {
  const h = harness(t);
  h.write({ commands: [] });
  h.emit();
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.notices, []);
});
