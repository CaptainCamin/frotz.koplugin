-- Run from the plugin directory: texlua tests/library.lua
package.path = './?.lua;' .. package.path
local files = {
    ['/games'] = 'directory', ['/games/sub'] = 'directory',
    ['/games/a.z5'] = 'file', ['/games/sub/b.ulx'] = 'file',
    ['/games/page.html'] = 'file', ['/games/story.html'] = 'file',
    ['/games/loop'] = 'link', ['/games/readme.txt'] = 'file',
    ['/hidden'] = 'directory', ['/hidden/.collection'] = 'directory',
    ['/hidden/.collection/game.z5'] = 'file',
}
local children = { ['/games'] = {'.', '..', 'a.z5', 'sub', 'page.html', 'story.html', 'loop', 'readme.txt'},
    ['/games/sub'] = {'b.ulx'}, ['/hidden'] = {'.collection'},
    ['/hidden/.collection'] = {'game.z5'} }
local saved, flushes = {}, 0
package.preload.datastorage = function() return {getDataDir = function() return '/data' end} end
package.preload.luasettings = function() return {open = function() return {
    readSetting = function(_, key) return saved[key] end,
    saveSetting = function(_, key, value) saved[key] = value end,
    flush = function() flushes = flushes + 1 end,
} end} end
package.preload['libs/libkoreader-lfs'] = function() return {
    attributes = function(path) return files[path] end,
    symlinkattributes = function(path) return files[path] end,
    dir = function(path)
        assert(children[path], 'unreadable directory')
        local i = 0
        return function() i = i + 1; return children[path][i] end
    end,
} end
package.preload.util = function() return {makePath = function() end} end
local Resolver = require('engines/resolver')
Resolver.is_twine_file = function(path) return path == '/games/story.html' end
local Library = require('gamelibrary')
local library = Library.open()
library:put('/games/a.z5', {title = 'Zebra', author = 'An author', cover = 'a.jpg'})
library:put('/missing.z5', {title = 'Disconnected'})
local browser_handle = Library.open()
local launch_handle = Library.open()
assert(browser_handle == launch_handle, 'concurrent handles share one library')
launch_handle:put('/games/a.z5', {last_played = 123})
browser_handle:put('/games/b.z5', {title = 'Shared state'})
assert(launch_handle:get('/games/a.z5').last_played == 123, 'a later save preserves play time')
assert(browser_handle:get('/games/b.z5').title == 'Shared state')
local before = flushes
assert(library:scan('/games') == 2)
assert(flushes == before + 1, 'scan writes once')
assert(library:scan('/games') == 0, 'import is idempotent')
assert(library:scan('/unreadable') == 0)
local entries = library:entries()
assert(#entries == 3)
assert(entries[1].title == 'b.ulx' and entries[3].title == 'Zebra')
assert(library:get('/missing.z5'), 'missing metadata is retained')
assert(not library:get('/games/page.html'), 'ordinary HTML is excluded')
assert(library:get('/games/a.z5').author == 'An author', 'metadata survives import')
entries[3].title = 'Changed'
assert(library:get('/games/a.z5').title == 'Zebra', 'records are copies')
local ticks, starts = {}, {}
package.preload['ui/uimanager'] = function() return {nextTick = function(_, callback) ticks[#ticks + 1] = callback end} end
package.preload.logger = function() return {warn = function() end} end
package.preload.gettext = function() return function(s) return s end end
local plugin = {ui = {}, _libraryEntries = function() return library:entries() end,
    _startGame = function(_, path) starts[#starts + 1] = path end}
local Integration = require('bookshelf_integration')
Integration.register(plugin)
assert(#ticks == 1, 'registration retries after plugin loading')
local registered
plugin.ui.bookshelf = {SOURCE_API = 1, registerSource = function(_, id, spec)
    assert(id == 'frotz'); registered = spec; return true
end}
assert(ticks[1]())
local records = registered.list()
assert(#records == 3 and records[3].filepath == '/games/a.z5')
assert(records[3].cover_image_path == '/data/frotz_library/covers/a.jpg')
assert(records[3].format == 'Z5' and records[3].author == 'An author')
assert(registered.open(records[3]) == true)
assert(starts[1] == '/games/a.z5', 'game opens through Frotz')
assert(library:scan('/hidden') == 1, 'hidden folders are imported')
assert(library:get('/hidden/.collection/game.z5'), 'hidden game is retained')
print('Game library and Bookshelf integration tests passed')
