// Integration checks against the unmodified, separately downloaded game.
// Download 4x4GalaxyScreenReaderFriendly.zip from the IF Archive, extract it,
// then: qjs twine/test/galaxy.js "path/to/4x4 Galaxy_screen reader friendly.html"
// The author’s story is not redistributed with these tests. Endgame checks
// use explicit progress checkpoints; the exploration walks use only links.
import * as std from "std";
import { loadEngine, screenText, findLink } from "./harness.js";

const path = scriptArgs[1];
if (!path) throw new Error("pass the downloaded 4x4 Galaxy HTML file");
let checks = 0, clicks = 0;
const seen = new Set();
function assert(ok, message) {
    checks++;
    if (!ok) throw new Error(message);
}
function inspect(e) {
    seen.add(e.passageName);
    const screen = screenText(e);
    assert(e._warned.size === 0, "unsupported feature: " + [...e._warned].join(", "));
    assert(!/<alert>\[/.test(screen.text), e.passageName + ": " + screen.text);
    return screen;
}
function click(e, label) {
    const id = findLink(e, label);
    assert(id !== undefined, e.passageName + ": missing " + label);
    e.activate(id);
    clicks++;
    inspect(e);
}
function enter(e, name, vars = {}) {
    // A progress checkpoint, not a modification to the story or its passages.
    Object.assign(e.vars, vars);
    assert(e._enter(name), "missing checkpoint " + name);
    e._navigate();
    inspect(e);
}
function game(seed) {
    const e = loadEngine(path, { seed });
    e.start();
    inspect(e);
    return e;
}

const classes = new Set(), objectives = new Set();
for (let seed = 1; seed <= 32; seed++) {
    const e = game(seed), v = e.vars;
    classes.add(v.playerclass); objectives.add(v.gameobjective);
    assert(v.playername && v.shipname && v.startplanetname, "world initialization");
    for (const suffix of ["name", "type", "story"]) {
        const values = Array.from({ length: 16 }, (_, i) => v[`planet${i + 1}${suffix}`]);
        assert(values.every(Boolean) && new Set(values).size === 16, "unique planet " + suffix);
    }
    click(e, "New game");
    click(e, "Open the Galaxy Map");
    click(e, "Select your travel destination");
    assert(inspect(e).links.length >= 17, "sixteen destinations and journal");
    const before = screenText(e).text, saved = e.saveData();
    click(e, "Open journal");
    e.undo();
    assert(screenText(e).text === before, "map undo replay");
    e.loadData(saved);
    assert(screenText(e).text === before, "map save replay");
}
assert(classes.size === 5 && objectives.size === 3, "all classes and quest types generated");
print("ok: generated worlds, map, journal, undo and saves across all classes/objectives");

// Cover every map destination without changing combat stats or forcing results.
{
    const e = game(1);
    enter(e, "GalaxyMap");
    const saved = e.saveData();
    for (let i = 1; i <= 16; i++) {
        e.loadData(saved);
        click(e, "#" + i);
        assert(e.vars.traveldestination === "planet" + i, "map destination " + i);
        const before = screenText(e).text, vars = JSON.stringify(e.vars), save = e.saveData();
        e.loadData(save);
        assert(screenText(e).text === before && JSON.stringify(e.vars) === vars, "travel/combat save replay " + i);
    }
}
print("ok: all sixteen travel links and encounter save replay");

// The sidebar is gameplay, not decoration: healing, map assembly and return.
{
    const e = game(1);
    enter(e, "GalaxyMap", { playerhp: 4, shiphp: 20, medkit: 1, repairkit: 1 });
    click(e, "(click to USE)");
    assert(e.vars.playerhp === 9 && e.vars.medkit === 0, "medkit consumed");
    click(e, "(click to USE)");
    assert(e.vars.shiphp === 70 && e.vars.repairkit === 0, "repair kit consumed");
    click(e, "Help");
    click(e, "Back");
    assert(e.passageName === "GalaxyMap", "help returns to gameplay");
    enter(e, "GalaxyMap", { mappieces: 3, miningequipment: 1 });
    click(e, "Put the map together");
    assert(e.vars.map && e.vars.mappieces === 0, "map assembled via sidebar");
    click(e, "Continue");
    assert(e.passageName === "GalaxyMap", "assembled map return callback");
    click(e, "(click to EXAMINE)");
    click(e, "Continue");
    assert(e.passageName === "GalaxyMap", "examined map return callback");
    enter(e, "findartefact");
    click(e, "Dig out the artefact");
    assert(screenText(e).text.includes("CONGRATULATIONS, YOU WIN!"), "artefact ending");
    click(e, "Main menu");
    click(e, "About");
    click(e, "Back");
    assert(e.passageName === "menu2", "about return callback");
    click(e, "Load game");
    assert(screenText(e).text.includes("Restore game"), "visible save menu guidance");
    click(e, "Restart game");
    assert(e.passageName === "menu1" && e.history.length === 1 && !e.vars.map, "fresh restart");
}
print("ok: inventory, quest map, artefact ending, help/about, save guidance and restart");

// Check the other quest conclusions from endgame progress checkpoints.
for (const [start, ending] of [["slaversmercenaries", "slaversmercenarieswin"], ["tyrantmercenaries", "tyrantmercenarieswin"]]) {
    const e = game(1);
    enter(e, start);
    click(e, "Continue");
    assert(e.passageName === ending && screenText(e).text.includes("CONGRATULATIONS, YOU WIN!"), ending);
    const before = screenText(e).text;
    e.loadData(e.saveData());
    assert(screenText(e).text === before, "ending replay " + ending);
}
print("ok: slavers and tyrant quest endings from checkpoints");

// Final-round combat checkpoints cover both direct-combat quest endings and
// verify that consumable setters and random rolls replay after save/undo.
for (const [start, weapon, item, ending] of [
    ["slaversfight", "Launch an energy torpedo", "torpedo", "slaverswingame"],
    ["tyrantcombat", "Throw an energy grenade", "energygrenade", "tyrantcombatwin"],
]) {
    const e = game(1);
    enter(e, start, { initialisecombat: false, initiative: true, enemyhp: 10,
        enemyhitchance: 6, enemydamage: 5, hitchance: 6, [item]: 1 });
    click(e, weapon);
    assert(e.vars[item] === 0 && e.vars.enemyhp <= 0, "combat consumable " + item);
    const before = screenText(e).text, saved = e.saveData();
    e.loadData(saved);
    assert(screenText(e).text === before, "combat save replay " + start);
    click(e, "Continue");
    assert(e.passageName === ending && screenText(e).text.includes("CONGRATULATIONS, YOU WIN!"), ending);
    e.undo();
    assert(screenText(e).text === before, "combat undo replay " + start);
}
print("ok: direct-combat endings, consumables and random-roll replay from checkpoints");

// Broad walks: prefer less-used choices, excluding interface-only links.
for (let seed = 1; seed <= 12; seed++) {
    const e = game(seed), counts = new Map();
    for (let step = 0; step < 500; step++) {
        const { runs, links } = inspect(e), labels = new Map();
        for (const r of runs) if (r.link) labels.set(r.link, (labels.get(r.link) || "") + r.text);
        let choices = links.filter(id => !/(Exit to menu|Help|Load game|Restart|About|INFO|click to USE)/i.test(labels.get(id)));
        if (!choices.length || e.vars.dead) break;
        const key = id => e.passageName + "|" + labels.get(id);
        const min = Math.min(...choices.map(id => counts.get(key(id)) || 0));
        choices = choices.filter(id => (counts.get(key(id)) || 0) === min);
        const id = choices[Math.floor(Math.random() * choices.length)];
        counts.set(key(id), min + 1);
        e.activate(id); clicks++;
        inspect(e);
    }
}
print(`all passed: ${checks} checks, ${clicks} clicks, ${seen.size} passages`);
