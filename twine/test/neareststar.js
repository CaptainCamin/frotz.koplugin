// qjs twine/test/neareststar.js /path/to/A_Long_Way_to_the_Nearest_Star.html
// Uses the unmodified IFComp 2022 game, downloaded separately. Progress
// checkpoints below are labelled; they are not a complete puzzle walkthrough.
import { loadEngine, screenText, findLink } from "./harness.js";
const path = scriptArgs[1];
if (!path) throw new Error("pass the separately downloaded game HTML");
let checks = 0, clicks = 0;
const seen = new Set();
function assert(ok, message) { checks++; if (!ok) throw new Error(message); }
function inspect(e) {
    const screen = screenText(e);
    seen.add(e.passageName);
    assert(!/<alert>\[/.test(screen.text), e.passageName + ": " + screen.text);
    assert(e._warned.size === 0, "unsupported: " + [...e._warned].join(", "));
    return screen;
}
function game(seed = 1) { const e = loadEngine(path, {seed}); e.start(); inspect(e); return e; }
function click(e, label) {
    const id = findLink(e, label);
    assert(id !== undefined, e.passageName + ": missing " + label);
    e.activate(id); clicks++; return inspect(e);
}
function timer(e) { assert(e.fireTimers(), "timer expected"); inspect(e); }
function replay(e) {
    const before = screenText(e).text, vars = JSON.stringify(e.vars);
    e.loadData(e.saveData());
    assert(screenText(e).text === before && JSON.stringify(e.vars) === vars, "save replay " + e.passageName);
    inspect(e);
}
function checkpoint(e, name, vars) {
    Object.assign(e.vars, vars);
    assert(e._enter(name), "checkpoint " + name);
    e._navigate(); inspect(e);
}
{
    const e = game();
    click(e, "Settings");
    click(e, "Terminal screens");
    assert(e.format.env.settings.terminals === false, "settings toggle");
    replay(e);
    click(e, "Close settings");
    click(e, "New game"); timer(e);
    click(e, "Continue"); click(e, "Continue"); click(e, "Continue");
    click(e, "Quietly, you step out of your ship.");
    click(e, "Inventory and notes");
    click(e, "Examine");
    assert(screenText(e).text.includes("Your trusty flashlight"), "widget dialog description");
    replay(e);
    click(e, "Close");
    assert(!e.format.env.Dialog.isOpen(), "dialog closed");
    click(e, "Turn on"); timer(e);
    click(e, "a blue light begins to flicker");
    assert(e.undo(), "intro undo"); inspect(e);
    replay(e);
}
print("ok: actual introduction, inventory dialogs, settings, timers and save/undo");
{
    const e = game();
    for (const name of ["Alex", "hey you", "'Alex'", "A", "007"]) {
        checkpoint(e, "namegiven", {name});
        assert(!screenText(e).text.includes("<nowiki>"), "names render as text");
        replay(e);
    }
    checkpoint(e, "hello", {name: "Alex", friendship: 2});
    assert(screenText(e).text.includes("Alex"), "nested name widget wikifies its result");
    checkpoint(e, "mixer", {room: "lab2", mixer: ["yellow", "purple", "battery"]});
    checkpoint(e, "usemixer", {room: "lab2", mixer: ["yellow", "purple", "battery"]});
    click(e, "until"); replay(e);
    checkpoint(e, "deck", {linecrawler: true, breath: 21});
    assert(e.passageName === "deckdeath", "navigation override enforces the deck hazard");
}
print("ok: naming regexes, dialogue widgets, mixer puzzle and navigation rules from checkpoints");
{
    const e = game();
    checkpoint(e, "game", {name: "Alex"});
    assert(screenText(e).text.includes("Sun piece:"), "the board piece has a text position");
    let turns = 0;
    while (!e.vars.result && turns++ < 30) {
        click(e, "Move to");
        replay(e);
        if (e.nextTimerDelay() !== null) timer(e);
    }
    assert(e.vars.result === "playerwin" || e.vars.result === "soliswin", "complete a board-game round");
    replay(e);
}
print("ok: accessible board buttons, scripted region updates, timed AI moves and a completed round");
for (let end = 0; end <= 6; end++) {
    const e = game();
    checkpoint(e, "theend", {end});
    while (e.nextTimerDelay() !== null) timer(e);
    assert(screenText(e).text.includes("Ending " + (end === 6 ? "?" : end)), "ending checkpoint " + end);
    replay(e);
    click(e, "Restart");
    assert(e.passageName === "mainmenu", "ending restart");
    if (end < 6) assert(findLink(e, "Endings and achievements") !== undefined, "ending unlock survives restart");
}
print("ok: all ending displays, timers, save replay and Engine.restart from checkpoints");
// Explore actual links without injecting state; use an independent PRNG for
// choosing actions so test decisions don't consume the game's random draws.
let choice = 0x12345678;
function pick(n) { choice ^= choice << 13; choice ^= choice >>> 17; choice ^= choice << 5; return (choice >>> 0) % n; }
for (let seed = 1; seed <= 10; seed++) {
    const e = game(seed), counts = new Map();
    for (let step = 0; step < 500; step++) {
        const {runs, links} = inspect(e), labels = new Map();
        for (const r of runs) if (r.link) labels.set(r.link, (labels.get(r.link) || "") + r.text);
        if (e.lineRequest) { e.submitLine("Alex"); inspect(e); continue; }
        if (!links.length) { if (e.nextTimerDelay() !== null) timer(e); else break; continue; }
        let options = links.filter(id => !/^(Settings|Restart|Load game|Save\/load game|Close settings)$/.test(labels.get(id).trim()));
        if (!options.length) { if (e.nextTimerDelay() !== null) timer(e); else break; continue; }
        const key = id => e.passageName + "|" + labels.get(id);
        const min = Math.min(...options.map(id => counts.get(key(id)) || 0));
        options = options.filter(id => (counts.get(key(id)) || 0) === min);
        const id = options[pick(options.length)];
        counts.set(key(id), min + 1);
        e.activate(id); clicks++; inspect(e);
        if (step % 50 === 0) replay(e);
    }
}
print(`all passed: ${checks} checks, ${clicks} clicks, ${seen.size} passages`);
