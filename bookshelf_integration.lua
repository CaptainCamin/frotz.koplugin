-- Bookshelf source API v1. Optional: Frotz works without Bookshelf installed.
local GameLibrary = require("gamelibrary")
local Resolver = require("engines/resolver")
local UIManager = require("ui/uimanager")
local logger = require("logger")
local _ = require("gettext")

local M = {}

local function live(fallback)
    local fm = package.loaded["apps/filemanager/filemanager"]
    if fm and fm.instance and fm.instance.frotz then return fm.instance.frotz end
    local reader = package.loaded["apps/reader/readerui"]
    if reader and reader.instance and reader.instance.frotz then return reader.instance.frotz end
    return fallback
end

function M.makeSource(plugin)
    return {
        api = 1,
        label = function() return _("Game library") end,
        available = function() return true end,
        sort_default = { { key = "title", reverse = false } },
        list = function()
            local records = {}
            for _, entry in ipairs(live(plugin):_libraryEntries()) do
                records[#records + 1] = {
                    filepath = entry.path,
                    title = entry.title,
                    author = entry.author,
                    authors = entry.author and { entry.author } or {},
                    cover_image_path = entry.cover and GameLibrary.coverPath(entry.cover) or nil,
                    format = (Resolver.ext_of(entry.path) or ""):upper(),
                    rating = entry.rating,
                    added_time = entry.added,
                    last_opened = entry.last_played,
                    last_read_time = entry.last_played,
                }
            end
            return records
        end,
        owns = function(record)
            return record and record.filepath and GameLibrary.open():get(record.filepath) ~= nil or false
        end,
        open = function(record)
            live(plugin):_startGame(record.filepath)
            return true -- handled: never send a story file to ReaderUI
        end,
    }
end

function M.register(plugin)
    local function register()
        local bs = plugin.ui and plugin.ui.bookshelf
        if not (bs and bs.registerSource and (bs.SOURCE_API or 0) >= 1) then return false end
        local ok, why = bs:registerSource("frotz", M.makeSource(plugin))
        if not ok then logger.warn("Frotz: Bookshelf source refused:", why) end
        return ok
    end
    if not register() then UIManager:nextTick(register) end
end

return M
