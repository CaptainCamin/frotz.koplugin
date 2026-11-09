// twine/test/regressions.js — Twine 2 format bugs found on real stories.
//
//   qjs --std twine/test/regressions.js      (exit status 1 on a failure)

import * as std from "std";
import { loadEngineFromHtml, screenText, findLink } from "./harness.js";

// A Twine 2 story file; the first passage starts. A passage is its text, or
// [text, tags].
function storyHtml(format, version, passages, script = "") {
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const data = Object.entries(passages).map(([name, p], i) => {
        const [text, tags] = Array.isArray(p) ? p : [p, ""];
        return `<tw-passagedata pid="${i + 1}" name="${esc(name)}" tags="${esc(tags)}">${esc(text)}</tw-passagedata>`;
    }).join("");
    return `<html><body><tw-storydata name="Test" startnode="1" format="${format}" format-version="${version}" ifid="TEST">`
        + `<script role="script" id="twine-user-script" type="text/twine-javascript">${script}</script>${data}</tw-storydata></body></html>`;
}

let failures = 0;
function check(what, ok, got) {
    print((ok ? "ok    " : "FAIL  ") + what + (ok ? "" : `\n      got: ${JSON.stringify(got)}`));
    if (!ok) failures++;
}

function test(name, fn) {
    try {
        fn();
    } catch (e) {
        check(`${name}: ${e.message}`, false, e.stack);
    }
}

test("Harlowe hook starting with [[", () => {
    // Birdland: link text holds no "]", so `[[Verse]<v|` is a named hook in a hook.
    const e = loadEngineFromHtml(storyHtml("Harlowe", "3.3.8",
        { Start: "[[Verse one]<v1| and more]<verses|(click: ?v1)[(replace: ?verses)[Sung.]] [[Go->Two]]", Two: "" }));
    e.start();
    const { text, links } = screenText(e);
    check("Harlowe: `[[text]<name|` is a hook, `[[Go->Two]]` still a link",
        text === "[Verse one]{1} and more [Go]{2}" && links.length === 2, text);
});

test("Harlowe nesting stays fast", () => {
    let src = "x";
    for (let d = 0; d < 14; d++) src = `[[${src}]<h${d}| y]<g${d}|`;
    const e = loadEngineFromHtml(storyHtml("Harlowe", "3.3.8", { Start: src }));
    const t0 = Date.now();
    e.start();
    check("Harlowe: 14 nested `[[…]<name|` hooks render quickly", Date.now() - t0 < 1000, Date.now() - t0);
});

test("Harlowe 's after a call", () => {
    // Will Not Let Me Go, verses, Animalia, Tavern Crawler, Fabricationist.
    const cases = [
        ["(print: (passage:)'s name)", "Start"],
        [`(if: (passage:)'s tags contains "x")[tagged]`, "tagged"],
        ["(if: (passage:)'s tags's length > 0)[has tags]", "has tags"],
        ["(print: (a: 5, 6)'s 1st)", "5"],
        ["(set: $a to (a: (a: 7, 8)))(print: $a's 1st's last)", "8"],
        ["(set: $a to (a: 1, 2))(print: $a's length)", "2"],
    ];
    for (const [src, want] of cases) {
        const e = loadEngineFromHtml(storyHtml("Harlowe", "3.3.8", { Start: [src, "x"] }));
        e.start();
        check(`Harlowe: ${src}`, screenText(e).text === want, screenText(e).text);
    }
});

test("Harlowe (more:)", () => {
    // verses: the way on appears once the words to translate are all tapped.
    const e = loadEngineFromHtml(storyHtml("Harlowe", "3.3.8",
        { Start: `Tu ești.(click-replace: "Tu")[You](more:)[ [[Onward->Two]]]`, Two: "" }));
    e.start();
    check("Harlowe (more:): hidden while another link is on the page",
        screenText(e).links.length === 1 && findLink(e, "Onward") === undefined, screenText(e).text);
    e.activate(findLink(e, "Tu"));
    check("Harlowe (more:): shown when no link is left", findLink(e, "Onward") !== undefined, screenText(e).text);
});

test("SugarCube 2 with the Twine 1 revision library", () => {
    // Cozy Simulation 2999 ships the library; SugarCube 2 must keep its own <<cycle>>.
    const library = `(function(){var h=function(){};[{name:"cycle",flavour:"cycle",trigger:"revisemacro"},
        {name:"replace",flavour:"replace",trigger:"link"}].forEach(function(e){e.handler=h;macros[e.name]=e;});}());`;
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<set $c to "a">>Pattern: <<cycle "$c" autoselect>><<option "a">><<option "b">><</cycle>>`,
    }, library));
    e.start();
    check("SugarCube 2: <<cycle>> is SugarCube's, not the library's", screenText(e).text === "Pattern: [a]{1}", screenText(e).text);
});

test("SugarCube `is not`", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1",
        { Start: `<<if 1 is not 2>>differs<</if>><<if 1 is not 1>>same<</if>>` }));
    e.start();
    check("SugarCube: `is not` is !==", screenText(e).text === "differs", screenText(e).text);
});

test("SugarCube array deletion", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.28.2", {
        Start: `<<set $pool to [1, 2, 1, 3, 2, 4]>><<set $removed to $pool.delete([2, 1])>>`,
    }));
    e.start();
    check("SugarCube: delete accepts value lists and removes every match",
        JSON.stringify(e.vars.pool) === "[3,4]" && JSON.stringify(e.vars.removed) === "[2,2,1,1]", e.vars);
    check("SugarCube: empty random returns undefined", [].random() === undefined);
});

test("SugarCube generated worlds and passage tasks", () => {
    const script = `predisplay.return = function (name) {
        if (!tags().contains("noreturn")) State.variables.return = passage();
        State.variables.taskName = name;
        State.variables.taskTitle = this.title;
    };`;
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.28.2", {
        Start: `<<set $hp to 4>>[[Help]]`,
        Help: ["[[Back|$return]]", "noreturn"],
        StoryInit: `<<set setup.names to ["One", "Two", "Three"]>><<set $names to []>>
            <<for _i to 0; _i lt 3; _i++>><<set _name to setup.names.random()>>
            <<run $names.push(_name)>><<run setup.names.delete(_name)>><</for>>`,
        StoryCaption: `HP: $hp <<if $hp lt 10>>[[Heal|$return][$hp += 5]]<</if>>`,
        StoryMenu: `[[Help]]`,
    }, script));
    e.start();
    check("SugarCube: random/delete generate a permutation", e.vars.names.length === 3 && new Set(e.vars.names).size === 3, e.vars.names);
    check("SugarCube: array extensions are non-enumerable", !Object.keys([]).includes("random") && !Object.prototype.propertyIsEnumerable.call(Array.prototype, "delete"));
    check("SugarCube: predisplay establishes return before sidebar", e.vars.return === "Start" && e.vars.taskName === "return" && e.vars.taskTitle === "Start", e.vars);
    check("SugarCube: caption and menu are visible", screenText(e).text.includes("HP: 4") && findLink(e, "Heal") !== undefined, screenText(e).text);
    e.activate(findLink(e, "Help"));
    e.activate(findLink(e, "Back"));
    check("SugarCube: noreturn passage returns to the game", e.passageName === "Start", e.passageName);
    e.activate(findLink(e, "Heal"));
    // Start resets hp; the setter still ran before passage entry.
    check("SugarCube: sidebar setter ran before navigation", JSON.parse(e.current.vars).hp === 9, e.current.vars);
    const saved = e.saveData(), before = screenText(e).text;
    e.loadData(saved);
    check("SugarCube: sidebar and callbacks replay on load", screenText(e).text === before, screenText(e).text);
    e.activate(findLink(e, "Help"));
    e.undo();
    check("SugarCube: sidebar and callbacks replay on undo", screenText(e).text === before, screenText(e).text);
});

test("SugarCube task ordering and restart", () => {
    const script = `predisplay.a = function (name) { State.variables.order = "display"; };
        prerender.b = function () { State.variables.order += ",render"; };
        postrender.c = function () { State.variables.order += ",rendered"; };
        postdisplay.d = function () { State.variables.order += ",displayed"; };`;
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.28.2", {
        Start: `[[Play->End]]`, End: `<<link "Restart">><<run UI.restart()>><</link>>`,
        StoryCaption: `$order`,
    }, script));
    e.start();
    check("SugarCube: lifecycle tasks precede sidebar", screenText(e).text.includes("display,render,rendered,displayed"), screenText(e).text);
    e.activate(findLink(e, "Play"));
    e.activate(findLink(e, "Restart"));
    check("SugarCube: author restart starts a fresh game", e.passageName === "Start" && e.history.length === 1, e.history);
});

test("SugarCube history helpers and navigation", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<print hasVisited("Start")>>/<<print hasVisited(["Start", "Next"])>> [[Go->Next]]`,
        Next: "wrong", Redirected: `<<print hasVisited("Start", "Redirected")>>`,
    }, `Config.navigation.override = function (dest) { if (dest === "Next") return "Redirected"; };`));
    e.start();
    check("SugarCube: hasVisited tests the current passage and all arguments", screenText(e).text.startsWith("true/false"), screenText(e).text);
    e.activate(findLink(e, "Go"));
    check("SugarCube: author navigation override redirects passage entry", e.passageName === "Redirected" && screenText(e).text === "true", screenText(e).text);
    e.undo();
    check("SugarCube: undone visits are no longer in history", !e.format.env.hasVisited("Redirected"));
});

test("SugarCube settings and page elements", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<if Config.debug>>debug<</if>><<print settings.hints>> [[Go->Next]]`,
        Next: "next", Controls: `[[Home->Start]]`,
    }, `Setting.addToggle("hints", {default: true});
        setPageElement("controls", ["Missing", "Controls"], "fallback");`));
    e.start();
    check("SugarCube: settings defaults initialize and debug is false", screenText(e).text.startsWith("true") && !screenText(e).text.includes("debug"), screenText(e).text);
    check("SugarCube: setPageElement renders the first existing passage", findLink(e, "Home") !== undefined && !screenText(e).text.includes("fallback"), screenText(e).text);
    e.activate(findLink(e, "Go"));
    e.activate(findLink(e, "Home"));
    check("SugarCube: page-element links survive passage navigation", e.passageName === "Start", e.passageName);
});

test("SugarCube regex literals", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<set $name to "hey you">><<if $name.match(/^["'“”‘’]?hey,? ?you["'“”‘’]?$/i)>>matched<</if>>`
            + `<<if /is >> not/.test("is >> not")>> regex<</if>> <<print 12 / 3>>`,
    }));
    e.start();
    check("SugarCube: quotes/operators/macro closers inside regex stay literal", screenText(e).text === "matched regex 4", screenText(e).text);
});

test("SugarCube widget dialog and replay", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<examine "Flashlight" "A broken flashlight.">>`,
        Widgets: [`<<widget "examine">><<link "Examine">><<script>>
            Dialog.setup(State.temporary.args[0]);
            Dialog.wiki(State.temporary.args[1] + " <<link 'Close'>><<run Dialog.close()>><</link>>");
            Dialog.open();
            <</script>><</link>><</widget>>`, "widget"],
    }));
    e.start();
    e.activate(findLink(e, "Examine"));
    const text = screenText(e).text;
    check("SugarCube: deferred widget links retain their arguments in a visible dialog", text.includes("Flashlight") && text.includes("A broken flashlight.") && findLink(e, "Close") !== undefined, text);
    const save = e.saveData();
    e.loadData(save);
    check("SugarCube: opening a dialog replays on restore", screenText(e).text === text, screenText(e).text);
    e.activate(findLink(e, "Close"));
    check("SugarCube: closing the dialog clears its text and links", !screenText(e).text.includes("broken flashlight") && findLink(e, "Close") === undefined, screenText(e).text);
});

test("SugarCube capture in loops", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<for _i = 0; _i < 3; _i++>><<capture _i>><<link 'Pick'>><<set $picked = _i>><</link>><</capture>><</for>>`,
    }));
    e.start();
    e.activate(screenText(e).links[1]);
    check("SugarCube: loop links use the captured iteration", e.vars.picked === 1, e.vars);
});

test("SugarCube inventory helpers", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<set $items to ["yellow", "yellow"]>><<run $items.pushUnique("purple", "purple", "battery")>>`
            + `<<print $items.count("yellow")>>/<<print $items.includesAll(["yellow", "purple", "battery"])>>/<<print "alex".toUpperFirst()>>`,
    }));
    e.start();
    check("SugarCube: pushUnique/count/includesAll/toUpperFirst support inventory puzzles", e.vars.items.length === 4 && screenText(e).text === "2/true/Alex", screenText(e).text);
});

test("SugarCube HTML controls and settings replay", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<button aria-label="Options" onclick="SugarCube.UI.settings()">icon</button>`,
    }, `Setting.addToggle("hints", {label: "Hints", default: true});`));
    e.start();
    e.activate(findLink(e, "Options"));
    e.activate(findLink(e, "Hints: On"));
    check("SugarCube: HTML buttons invoke accessible settings controls", e.format.env.settings.hints === false, screenText(e).text);
    const before = screenText(e).text;
    e.loadData(e.saveData());
    check("SugarCube: toggled settings replay exactly on restore", e.format.env.settings.hints === false && screenText(e).text === before, screenText(e).text);
});

test("SugarCube ending memory survives restart", () => {
    const html = storyHtml("SugarCube", "2.36.1", {
        Start: `<<if recall("finished", false)>>Completed!<</if>><<link "Finish">><<run memorize("finished", true)>><<run Engine.restart()>><</link>>`,
    });
    const e = loadEngineFromHtml(html);
    e.start(); e.activate(findLink(e, "Finish"));
    check("SugarCube: achievements persist through author restart", screenText(e).text.includes("Completed!"), screenText(e).text);
    const save = e.saveData();
    const fresh = loadEngineFromHtml(html); fresh.start(); fresh.loadData(save);
    check("SugarCube: story memory resumes in a new player", screenText(fresh).text.includes("Completed!"), screenText(fresh).text);
});

test("SugarCube generated HTML game controls", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<set _label to "Sun piece: b2">><div @aria-label="_label">icon</div>`
            + `<div class="game"><<for _i = 1; _i <= 2; _i++>><<capture _i>>`
            + `<<set _label to "Move " + _i>><<set _action to "$.wiki('<<set $move to " + _i + ">><<replace .game>>Moved<</replace>>')">>`
            + `<button @aria-label="_label" @onclick="_action"></button><</capture>><</for>></div>`,
    }));
    e.start();
    check("SugarCube: dynamic aria labels replace icon-only content", screenText(e).text.includes("Sun piece: b2") && !screenText(e).text.includes("icon"), screenText(e).text);
    e.activate(findLink(e, "Move 2"));
    check("SugarCube: generated onclick runs $.wiki with its bound loop action", e.vars.move === 2 && screenText(e).text.includes("Moved") && findLink(e, "Move 1") === undefined, screenText(e).text);
});

test("SugarCube memory actions replay once on save", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<print recall("count", 0)>><<link "Bump">><<run memorize("count", recall("count", 0) + 1)>><</link>>`,
    }));
    e.start();
    e.activate(findLink(e, "Bump"));
    check("SugarCube: memory action advances once", e.memory.count === 1, e.memory);
    e.loadData(e.saveData());
    check("SugarCube: restoring a save does not repeat memory actions", e.memory.count === 1, e.memory);
});

test("SugarCube memory actions replay once on undo", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `Count: <<print recall("count", 0)>> <<link "Bump">><<run memorize("count", recall("count", 0) + 1)>><<goto "Next">><</link>>`,
        Next: "next",
    }));
    e.start();
    e.activate(findLink(e, "Bump"));
    check("SugarCube: navigating memory action advances once", e.passageName === "Next" && e.memory.count === 1, { passage: e.passageName, memory: e.memory });
    e.undo();
    check("SugarCube: undo restores memory before the action", e.passageName === "Start" && e.memory.count === undefined && screenText(e).text.startsWith("Count: 0"), { passage: e.passageName, memory: e.memory, text: screenText(e).text });
});

test("SugarCube older saves replace story memory", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<<if recall("finished", false)>>Completed!<</if>`,
    }));
    e.start();
    const data = JSON.parse(e.saveData());
    delete data.memory;
    delete data.moment.memory;
    e.memory.finished = true;
    e.memory.stale = true;
    e.loadData(JSON.stringify(data));
    check("SugarCube: older saves clear stale story memory", Object.keys(e.memory).length === 0 && !screenText(e).text.includes("Completed!"), { memory: e.memory, text: screenText(e).text });
});

test("SugarCube settings survive author restart", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `Hints: <<print settings.hints>> <<link "Restart">><<run Setting.setValue("hints", false)>><<run Engine.restart()>><</link>>`,
    }, `Setting.addToggle("hints", {default: true});`));
    e.start();
    e.activate(findLink(e, "Restart"));
    check("SugarCube: settings persist through author restart", e.format.env.settings.hints === false && screenText(e).text.includes("Hints: false"), screenText(e).text);
});

test("SugarCube settings persist through save restore", () => {
    const html = storyHtml("SugarCube", "2.36.1", {
        Start: `Hints: <<print settings.hints>> <<link "Off">><<run Setting.setValue("hints", false)>><</link>>`,
    }, `Setting.addToggle("hints", {default: true});`);
    const e = loadEngineFromHtml(html);
    e.start();
    e.activate(findLink(e, "Off"));
    const save = e.saveData();
    const fresh = loadEngineFromHtml(html);
    fresh.start();
    fresh.loadData(save);
    check("SugarCube: save restores settings in a fresh player", fresh.format.env.settings.hints === false && fresh.preferences.settings.hints === false, { settings: fresh.format.env.settings, preferences: fresh.preferences });
    fresh.restart();
    check("SugarCube: restored settings survive another restart", fresh.format.env.settings.hints === false && screenText(fresh).text.includes("Hints: false"), screenText(fresh).text);
});

test("SugarCube setting callbacks replay on save and undo", () => {
    const html = storyHtml("SugarCube", "2.36.1", {
        Start: `Changes: <<print $hintChanges>> <<link "Toggle">><<run Setting.setValue("hints", false)>><</link>> [[Go->Next]]`,
        Next: "next",
        StoryInit: `<<set $hintChanges to 0>>`,
    }, `Setting.addToggle("hints", {default: true, onChange: function () {
        State.variables.hintChanges = (State.variables.hintChanges || 0) + 1;
    }});`);
    const e = loadEngineFromHtml(html);
    e.start();
    e.activate(findLink(e, "Toggle"));
    const save = e.saveData();
    e.loadData(save);
    check("SugarCube: save replay runs setting callbacks", e.vars.hintChanges === 1, e.vars);
    e.activate(findLink(e, "Go"));
    e.undo();
    check("SugarCube: undo replay runs setting callbacks", e.passageName === "Start" && e.vars.hintChanges === 1 && e.format.env.settings.hints === false, { passage: e.passageName, vars: e.vars, settings: e.format.env.settings });
});

test("SugarCube undo keeps player settings", () => {
    const html = storyHtml("SugarCube", "2.36.1", {
        Start: `Hints: <<print settings.hints>> [[Go->Next]]`,
        Next: `<<link "Off">><<run Setting.setValue("hints", false)>><</link>>`,
    }, `Setting.addToggle("hints", {default: true});`);
    const e = loadEngineFromHtml(html);
    e.start();
    e.activate(findLink(e, "Go"));
    e.activate(findLink(e, "Off"));
    check("SugarCube: setting change persists before undo", e.format.env.settings.hints === false, e.format.env.settings);
    e.undo();
    check("SugarCube: undo does not revert player settings", e.passageName === "Start" && e.format.env.settings.hints === false && e.preferences.settings.hints === false && screenText(e).text.includes("Hints: false"), { passage: e.passageName, settings: e.format.env.settings, text: screenText(e).text });
});

test("SugarCube restored settings rerun init", () => {
    const html = storyHtml("SugarCube", "2.36.1", {
        Start: `<<link "Off">><<run Setting.setValue("hints", false)>><</link>>`,
    }, `Setting.addToggle("hints", {default: true, onInit: function () {
        setup.showHints = settings.hints;
    }});`);
    const e = loadEngineFromHtml(html);
    e.start();
    e.activate(findLink(e, "Off"));
    const save = e.saveData();
    const fresh = loadEngineFromHtml(html);
    fresh.start();
    fresh.loadData(save);
    check("SugarCube: restored settings rerun onInit", fresh.format.env.settings.hints === false && fresh.format.env.setup.showHints === false, { settings: fresh.format.env.settings, setup: fresh.format.env.setup });
});

test("SugarCube HTML buttons tolerate quoted angle brackets", () => {
    const e = loadEngineFromHtml(storyHtml("SugarCube", "2.36.1", {
        Start: `<button aria-label="Compare" onclick="if (1 > 0) $.wiki('<<set $gt to true>>')">icon</button>`
            + `<button aria-label="Macro" onclick="$.wiki('<<set $macro to 42>>')">icon</button>`,
    }));
    e.start();
    check("SugarCube: quoted > keeps the HTML button action", findLink(e, "Compare") !== undefined, screenText(e).text);
    e.activate(findLink(e, "Compare"));
    check("SugarCube: literal > onclick runs", e.vars.gt === true, e.vars);
    e.activate(findLink(e, "Macro"));
    check("SugarCube: <<set>> onclick runs", e.vars.macro === 42, e.vars);
});

if (failures) {
    print(`\n${failures} failed`);
    std.exit(1);
}
print("\nall passed");
