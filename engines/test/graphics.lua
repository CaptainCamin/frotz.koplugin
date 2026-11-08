-- Run from the plugin root: lua engines/test/graphics.lua
local RemGlk = require("engines/remglk")
local engine = RemGlk:new({ send = function() end }, {
    encode = function() return "{}" end,
})
local seen = {}
engine.image_hook = function(span)
    seen[#seen + 1] = span.image
    if span.image == 3 then return nil end -- suppressed ornament
    return "[Illustration " .. span.image .. "]", "emphasized"
end
local update = engine:_normalize{
    type = "update", gen = 1,
    content = {
        { id = 1, text = {{ content = {{ text = "Story" }} }} },
        { id = 2, draw = {
            { special = "setcolor", color = "FFFFFF" },
            { special = "fill", x = 0, y = 0, width = 400, height = 300 },
            { special = "image", image = 2, width = 400, height = 300 },
            { special = "image", image = 3, width = 16, height = 16 },
        } },
    },
    input = {{ id = 1, gen = 1, type = "line" }},
}
assert(#seen == 2 and seen[1] == 2 and seen[2] == 3,
    "graphics images must reach the illustration policy/gallery")
local text = {}
for _, run in ipairs(update.story) do text[#text + 1] = run.text end
assert(table.concat(text) == "Story\n[Illustration 2]",
    "pictures must have their own line; fills and suppressed images add no blanks")
assert(not update.cleared, "graphics updates must not clear the story")
assert(update.input.kind == "line", "graphics must preserve the input request")
engine.image_hook = nil
local empty = engine:_normalize{ content = {
    { draw = {{ special = "image", image = 4 }} },
} }
assert(#empty.story == 0, "graphics without an image hook must be harmless")
print("graphics-window regression checks passed")
