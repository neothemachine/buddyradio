exports.start = () ->
	controller = new Controller.Radio([new Model.LastFmBuddyNetwork], [new Model.GroovesharkStreamingNetwork])
	new View.BuddySidebarSection(controller)
	controller.start()
	
exports.classes = () ->
	{ Model, View, Controller }

http = require("apollo:http")
LastFmApi = require("apollo:lastfm");
LastFmApi.key = "53cda3b9d8760dbded7b4ca420b5abb2"

EOVR = new Error("must be overriden")