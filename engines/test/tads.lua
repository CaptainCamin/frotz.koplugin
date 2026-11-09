-- Run from the plugin root: lua engines/test/tads.lua
local Resolver = require("engines/resolver")
local Ifdb = require("ifdb")
assert(Resolver.vm_for("Ditch.GAM") == "tadsr")
assert(Resolver.vm_for("return.t3") == "tadsr")
assert(Resolver.is_supported("games/example.gam"))
assert(Resolver.vm_for("story.z5") == "bocfel")
assert(Resolver.vm_for("story.ulx") == "git")
assert(Ifdb.isLikelySupported("TADS 2", "all"))
assert(Ifdb.isLikelySupported("TADS 3", "tads"))
assert(not Ifdb.isLikelySupported("TADS 2", "both"))
assert(not Ifdb.isLikelySupported("Twine", "tads"))
assert(not Ifdb.isLikelySupported("Inform 7", "tads"))
local queries = Ifdb.searchQueries("#ratings:10-", "tads")
assert(#queries == 1 and queries[1].query:find("format:*tads*", 1, true))
local links = Ifdb.playableLinks({ devsys = "TADS 3", links = {
    { url = "https://example.com/game.t3", is_game = true },
    { url = "https://example.com/game.zip", is_game = true, format = "tads3" },
    { url = "https://example.com/download?id=1", is_game = true, format = "tads2" },
    { url = "https://example.com/mac.hqx", is_game = true, format = "tads2" },
    { url = "https://example.com/compressed", is_game = true, format = "tads3", compression = "gzip" },
    { url = "https://example.com/play.html", is_game = true, format = "hypertextgame" },
}}, Resolver)
assert(#links == 3, "include native games and archives, exclude web players")
local seen = {}
for _, link in ipairs(links) do
    assert(link.vm == "tadsr")
    assert(link.label:find("TADS", 1, true))
    seen[link.filename] = true
end
assert(seen["game.t3"] and seen["game.zip"] and seen["download.gam"])
for _, arch in ipairs({"x86_64", "armel", "armhf", "aarch64"}) do
    local f = assert(io.open("binaries/" .. arch .. "/tadsr", "rb"), "missing TADS binary for " .. arch)
    assert(f:read(4) == "\127ELF", "TADS interpreter must be an ELF executable")
    f:close()
end
print("TADS format, IFDB and packaging checks passed")
