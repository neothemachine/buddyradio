(function() {
  var Controller, EOVR, LastFmApi, Model, View, http;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) {
    for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; }
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor;
    child.__super__ = parent.prototype;
    return child;
  }, __slice = Array.prototype.slice;
  if (window.console == null) window.console = {};
  if (console.debug == null) console.debug = (function() {});
  if (console.log == null) console.log = (function() {});
  if (console.info == null) console.info = (function() {});
  if (console.warn == null) console.warn = (function() {});
  if (console.error == null) console.error = (function() {});
  exports.start = function() {
    var controller;
    controller = new Controller.Radio([new Model.LastFmBuddyNetwork], [new Model.GroovesharkStreamingNetwork]);
    new View.Grooveshark(controller);
    return controller.start();
  };
  exports.classes = function() {
    return {
      Model: Model,
      View: View,
      Controller: Controller
    };
  };
  http = require("apollo:http");
  LastFmApi = require("apollo:lastfm");
  LastFmApi.key = "53cda3b9d8760dbded7b4ca420b5abb2";
  EOVR = new Error("must be overriden");
  Model = {};
  Model.APIRateLimiter = (function() {
    function APIRateLimiter(rate, per) {
      this.rate = rate;
      this.per = per * 1000;
      this._allowance = this.rate;
      this._lastCount = Date.now();
    }
    APIRateLimiter.prototype.count = function() {
      var current, timePassed;
      current = Date.now();
      timePassed = current - this._lastCount;
      this._lastCount = current;
      this._allowance += timePassed * (this.rate / this.per);
      if (this._allowance > this.rate) this._allowance = this.rate;
      if (this._allowance < 1) {
        console.error("API rate limit exceeded! always check with canSend() before!!");
      }
      return this._allowance -= 1;
    };
    APIRateLimiter.prototype.canSend = function() {
      var current, newAllowance, timePassed;
      current = Date.now();
      timePassed = current - this._lastCount;
      newAllowance = this._allowance + timePassed * (this.rate / this.per);
      return newAllowance >= 1;
    };
    return APIRateLimiter;
  })();
  Model.Buddy = (function() {
    function Buddy(network, username) {
      var info;
      this.network = network;
      this.username = username;
      this._handleNetworkEvent = __bind(this._handleNetworkEvent, this);
      info = this.network.getInfo(this.username);
      this.username = info.name;
      this.avatarUrl = info.avatarUrl;
      this.profileUrl = info.profileUrl;
      this.listeningStatus = this.network.getStatus(this.username);
      this.lastSong = this.network.getLastSong(this.username);
      this._networkListener = __bind(function(name, data) {
        return this._handleNetworkEvent(name, data);
      }, this);
      this.network.registerListener(this._networkListener, this.username);
      this._eventListeners = [];
    }
    Buddy.prototype.getLiveFeed = function() {
      console.log("getting live feed");
      return this.network.getLiveFeed(this.username);
    };
    Buddy.prototype.getHistoricFeed = function(from, to) {
      if (!(from instanceof Date) || !(to instanceof Date)) {
        throw new Error("times must be given for historic feed");
      }
      return this.network.getHistoricFeed(this.username, from, to);
    };
    Buddy.prototype.hasHistoricData = function(date) {
      if (!(date instanceof Date)) {
        throw new Error("date must be a Date object; time will be ignored");
      }
      return this.network.hasHistoricData(this.username, date);
    };
    Buddy.prototype.supportsHistoricFeed = function() {
      return this.listeningStatus !== "disabled" && (this.network.getHistoricFeed != null);
    };
    Buddy.prototype.registerListener = function(listener) {
      return this._eventListeners.push(listener);
    };
    Buddy.prototype.removeListener = function(listenerToBeRemoved) {
      var listener;
      return this._eventListeners = (function() {
        var _i, _len, _ref, _results;
        _ref = this._eventListeners;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          if (listener !== listenerToBeRemoved) _results.push(listener);
        }
        return _results;
      }).call(this);
    };
    Buddy.prototype.dispose = function() {
      this.network.removeListener(this._networkListener, this.username);
      return this._eventListeners = [];
    };
    Buddy.prototype._handleNetworkEvent = function(name, data) {
      var listener, _i, _len, _ref, _results;
      if (name === "statusChanged") {
        this.listeningStatus = data;
      } else if (name === "lastSongChanged") {
        this.lastSong = data;
      }
      _ref = this._eventListeners;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        _results.push(listener(name, data));
      }
      return _results;
    };
    Buddy.prototype.toString = function() {
      return "Buddy[" + this.network.name + ":" + this.username + "]";
    };
    return Buddy;
  })();
  Model.BuddyManager = (function() {
    function BuddyManager(buddyNetworks) {
      this.buddyNetworks = buddyNetworks;
      this._handleBuddyEvent = __bind(this._handleBuddyEvent, this);
    }
    BuddyManager.prototype.buddies = [];
    BuddyManager.prototype.storageKey = "buddyRadio_Buddies";
    BuddyManager.prototype.eventListeners = [];
    BuddyManager.prototype.getBuddy = function(buddyNetworkClassName, username) {
      return this.buddies.filter(function(buddy) {
        return buddy.network.className === buddyNetworkClassName && buddy.username === username;
      })[0];
    };
    BuddyManager.prototype.addBuddy = function(buddyNetworkClassName, username, dontSave) {
      var buddy, listener, network, _i, _j, _len, _len2, _ref, _ref2, _results, _results2;
      if (dontSave == null) dontSave = false;
      if (this.buddies.some(function(buddy) {
        return buddy.network.className === buddyNetworkClassName && buddy.username === username;
      })) {
        console.debug("user " + username + " is already added");
        return;
      }
      console.debug("adding " + buddyNetworkClassName + " user " + username);
      network = this._findBuddyNetwork(buddyNetworkClassName);
      if (network.isValid(username)) {
        buddy = new Model.Buddy(network, username);
        buddy.registerListener(__bind(function(name, data) {
          return this._handleBuddyEvent(buddy, name, data);
        }, this));
        this.buddies.push(buddy);
        if (!dontSave) this.saveLocal();
        console.info("user " + username + " added, informing listeners");
        _ref = this.eventListeners;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          _results.push(listener("buddyAdded", buddy));
        }
        return _results;
      } else {
        console.info("user " + username + " not found");
        _ref2 = this.eventListeners;
        _results2 = [];
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          listener = _ref2[_j];
          _results2.push(listener("buddyNotAdded", {
            username: username,
            reason: "notFound"
          }));
        }
        return _results2;
      }
    };
    BuddyManager.prototype.removeBuddy = function(buddyToBeRemoved) {
      var listener, _i, _len, _ref, _results;
      this.buddies = this.buddies.filter(function(buddy) {
        return buddy !== buddyToBeRemoved;
      });
      buddyToBeRemoved.dispose();
      this.saveLocal();
      console.info("user " + buddyToBeRemoved.username + " removed, informing listeners");
      _ref = this.eventListeners;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        _results.push(listener("buddyRemoved", buddyToBeRemoved));
      }
      return _results;
    };
    BuddyManager.prototype.importBuddies = function(buddyNetworkClassName, username) {
      var buddies, network, _i, _len;
      network = this._findBuddyNetwork(buddyNetworkClassName);
      buddies = network.getBuddies(username);
      if (buddies.error) {
        return buddies;
      } else {
        for (_i = 0, _len = buddies.length; _i < _len; _i++) {
          username = buddies[_i];
          this.addBuddy(buddyNetworkClassName, username, true);
        }
        this.saveLocal();
        return true;
      }
    };
    BuddyManager.prototype.saveLocal = function() {
      var buddy, listener, reducedBuddies, _i, _len, _ref, _results;
      console.debug("saving buddies");
      reducedBuddies = (function() {
        var _i, _len, _ref, _results;
        _ref = this.buddies;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          buddy = _ref[_i];
          _results.push([buddy.network.className, buddy.username]);
        }
        return _results;
      }).call(this);
      localStorage[this.storageKey] = JSON.stringify(reducedBuddies);
      _ref = this.eventListeners;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        _results.push(listener("buddiesSaved"));
      }
      return _results;
    };
    BuddyManager.prototype.loadLocal = function() {
      var listener, reducedBuddies, reducedBuddy, _i, _j, _len, _len2, _ref, _results;
      reducedBuddies = JSON.parse(localStorage[this.storageKey] || "[]");
      for (_i = 0, _len = reducedBuddies.length; _i < _len; _i++) {
        reducedBuddy = reducedBuddies[_i];
        this.addBuddy(reducedBuddy[0], reducedBuddy[1], true);
      }
      this.saveLocal();
      _ref = this.eventListeners;
      _results = [];
      for (_j = 0, _len2 = _ref.length; _j < _len2; _j++) {
        listener = _ref[_j];
        _results.push(listener("buddiesLoaded"));
      }
      return _results;
    };
    BuddyManager.prototype.registerListener = function(listener) {
      return this.eventListeners.push(listener);
    };
    BuddyManager.prototype._handleBuddyEvent = function(buddy, name, data) {
      var listener, _i, _len, _ref, _results;
      if (["statusChanged", "lastSongChanged"].indexOf(name) !== -1) {
        _ref = this.eventListeners;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          _results.push(listener(name, {
            buddy: buddy,
            data: data
          }));
        }
        return _results;
      }
    };
    BuddyManager.prototype._findBuddyNetwork = function(networkClassName) {
      return this.buddyNetworks.filter(function(network) {
        return network.className === networkClassName;
      })[0];
    };
    return BuddyManager;
  })();
  Model.BuddyNetwork = (function() {
    function BuddyNetwork() {}
    BuddyNetwork.prototype.name = "Network Name";
    BuddyNetwork.prototype.className = "Model.XYZBuddyNetwork";
    BuddyNetwork.prototype.isValid = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.getStatus = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.getInfo = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.getLastSong = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.getLiveFeed = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.getBuddies = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.registerListener = function(listener, buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.removeListener = function(listener, buddyId) {
      throw EOVR;
    };
    return BuddyNetwork;
  })();
  Model.Radio = (function() {
    function Radio(buddyNetworks, streamingNetworks) {
      this.buddyNetworks = buddyNetworks;
      this.streamingNetworks = streamingNetworks;
      this._handleSongFeedStreamEvent = __bind(this._handleSongFeedStreamEvent, this);
      this._handleFeedCombinatorEvent = __bind(this._handleFeedCombinatorEvent, this);
      this._handleBuddyManagerEvent = __bind(this._handleBuddyManagerEvent, this);
      this.buddyManager = new Model.BuddyManager(this.buddyNetworks);
      this.buddyManager.registerListener(this._handleBuddyManagerEvent);
      this._currentStream = null;
      this._eventListeners = [];
      this._feedEnabledBuddies = {};
      this._feedCombinator = new Model.AlternatingSongFeedCombinator();
      this._feedCombinator.registerListener(this._handleFeedCombinatorEvent);
      this._feededSongs = {};
      this._preloadCount = 1;
      this.onAirBuddy = null;
      this.loadSettings();
    }
    Radio.prototype._settingsStorageKey = "buddyRadio_Settings";
    Radio.prototype.tune = function(buddy, from, to) {
      var feed, historic, listener, newFeedType, oldOnAirBuddy, result, _i, _j, _k, _len, _len2, _len3, _ref, _ref2, _ref3;
      if (from == null) from = null;
      if (to == null) to = null;
      historic = (from != null) && (to != null);
      if (this.isFeedEnabled(buddy)) {
        newFeedType = historic ? "historic" : "live";
        feed = this._feedEnabledBuddies[buddy.username];
        this.tuneOut(buddy);
        if (newFeedType === "live") return;
      }
      if (buddy.listeningStatus === "disabled") {
        _ref = this._eventListeners;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          listener("errorTuningIn", {
            buddy: buddy,
            reason: "disabled"
          });
        }
        return;
      }
      feed = historic ? buddy.getHistoricFeed(from, to) : buddy.getLiveFeed();
      feed.registerListener(__bind(function(name, data) {
        var username;
        if (name === "endOfFeed") {
          username = this._getUsernameByFeed(data);
          console.debug("endOfFeed received for " + username);
          buddy = this.buddyManager.buddies.filter(function(buddy) {
            return buddy.username === username;
          })[0];
          return this.tuneOut(buddy, "endOfFeed");
        }
      }, this));
      this._feedCombinator.addFeed(feed);
      this._feedEnabledBuddies[buddy.username] = historic ? {
        feed: feed,
        type: "historic",
        from: from,
        to: to
      } : {
        feed: feed,
        type: "live"
      };
      _ref2 = this._eventListeners;
      for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
        listener = _ref2[_j];
        listener("tunedIn", buddy);
      }
      if (!(this._currentStream != null)) {
        this._currentStream = new Model.SongFeedStream(this._feedCombinator, this.streamingNetworks, this._preloadCount);
        this._currentStream.registerListener(this._handleSongFeedStreamEvent);
        console.debug("starting new stream");
        result = this._currentStream.startStreaming();
        console.debug("stream returned: " + result.status);
        if (result.status === "stopRequest") {
          oldOnAirBuddy = this.onAirBuddy;
          this.onAirBuddy = null;
          _ref3 = this._eventListeners;
          for (_k = 0, _len3 = _ref3.length; _k < _len3; _k++) {
            listener = _ref3[_k];
            listener("nobodyPlaying", {
              lastPlayingBuddy: oldOnAirBuddy
            });
          }
          return console.info("stream stopped");
        }
      }
    };
    Radio.prototype.tuneOut = function(buddy, reason) {
      var listener, _i, _len, _ref;
      if (reason == null) reason = "request";
      if (this.isFeedEnabled(buddy)) {
        this._feedCombinator.removeFeed(this._feedEnabledBuddies[buddy.username].feed);
        delete this._feedEnabledBuddies[buddy.username];
        _ref = this._eventListeners;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          listener("tunedOut", {
            buddy: buddy,
            reason: reason
          });
        }
        if (Object.keys(this._feedEnabledBuddies).length === 0) {
          this._currentStream.stopStreaming();
          this._currentStream.dispose();
          return this._currentStream = null;
        }
      }
    };
    Radio.prototype.registerListener = function(listener) {
      return this._eventListeners.push(listener);
    };
    Radio.prototype.isFeedEnabled = function(buddy) {
      return this._feedEnabledBuddies.hasOwnProperty(buddy.username);
    };
    Radio.prototype.getFeedType = function(buddy) {
      if (!this.isFeedEnabled(buddy)) throw new Error("feed isn't enabled!!");
      return this._feedEnabledBuddies[buddy.username].type;
    };
    Radio.prototype.getTotalCountForHistoricFeed = function(buddy) {
      if (this.getFeedType(buddy) !== "historic") {
        throw new Error("feed isn't historic!");
      }
      return this._feedEnabledBuddies[buddy.username].feed.totalCount;
    };
    Radio.prototype.getAlreadyFeededCount = function(buddy) {
      return this._feedEnabledBuddies[buddy.username].feed.feededCount;
    };
    Radio.prototype.isOnAir = function(buddy) {
      return buddy === this.onAirBuddy;
    };
    Radio.prototype.getSongsPerFeedInARow = function() {
      return this._feedCombinator.songsPerFeedInARow;
    };
    Radio.prototype.setSongsPerFeedInARow = function(count, dontSave) {
      if (dontSave == null) dontSave = false;
      this._feedCombinator.songsPerFeedInARow = count;
      if (!dontSave) return this.saveSettings();
    };
    Radio.prototype.getPreloadCount = function() {
      return this._preloadCount;
    };
    Radio.prototype.setPreloadCount = function(count) {
      this._preloadCount = count;
      if (this._currentStream != null) this._currentStream.preloadCount = count;
      return this.saveSettings();
    };
    Radio.prototype.loadSettings = function() {
      var settings;
      settings = JSON.parse(localStorage[this._settingsStorageKey] || "{}");
      if (settings.hasOwnProperty("songsPerFeedInARow")) {
        this.setSongsPerFeedInARow(settings.songsPerFeedInARow, true);
      }
      if (settings.hasOwnProperty("preloadCount")) {
        return this._preloadCount = settings.preloadCount;
      }
    };
    Radio.prototype.saveSettings = function() {
      var settings;
      settings = {
        songsPerFeedInARow: this.getSongsPerFeedInARow(),
        preloadCount: this._preloadCount
      };
      return localStorage[this._settingsStorageKey] = JSON.stringify(settings);
    };
    Radio.prototype._handleBuddyManagerEvent = function(name, data) {
      if (name === "buddyRemoved" && this.isFeedEnabled(data)) {
        this.tuneOut(data, "buddyRemoved");
      }
      if (name === "statusChanged" && data.data === "disabled" && this.isFeedEnabled(data.buddy)) {
        return this.tuneOut(data.buddy, "disabled");
      }
    };
    Radio.prototype._handleFeedCombinatorEvent = function(name, data) {
      var username;
      if (name === "nextSongReturned") {
        username = this._getUsernameByFeed(data.feed);
        if (!this._feededSongs.hasOwnProperty(username)) {
          this._feededSongs[username] = [];
        }
        this._feededSongs[username].push(data.song);
        return console.debug("song '" + data.song + "' feeded from " + username);
      }
    };
    Radio.prototype._getUsernameByFeed = function(feed) {
      return Object.keys(this._feedEnabledBuddies).filter(__bind(function(username) {
        return this._feedEnabledBuddies[username].feed === feed;
      }, this))[0];
    };
    Radio.prototype._getUsernameBySong = function(song) {
      return Object.keys(this._feededSongs).filter(__bind(function(username) {
        return this._feededSongs[username].indexOf(song) !== -1;
      }, this))[0];
    };
    Radio.prototype._handleSongFeedStreamEvent = function(name, data) {
      var listener, oldOnAirBuddy, song, username, _i, _j, _len, _len2, _ref, _ref2;
      if (name === "songPlaying") {
        song = data;
        username = this._getUsernameBySong(song);
        oldOnAirBuddy = this.onAirBuddy;
        this.onAirBuddy = this.buddyManager.buddies.filter(function(buddy) {
          return buddy.username === username;
        })[0];
        _ref = this._eventListeners;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          listener("nowPlaying", {
            buddy: this.onAirBuddy,
            lastPlayingBuddy: oldOnAirBuddy
          });
        }
        return console.debug("new song playing by " + this.onAirBuddy);
      } else if (name === "nothingPlaying") {
        oldOnAirBuddy = this.onAirBuddy;
        this.onAirBuddy = null;
        _ref2 = this._eventListeners;
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          listener = _ref2[_j];
          listener("nobodyPlaying", {
            lastPlayingBuddy: oldOnAirBuddy
          });
        }
        return console.debug("nobody's playing anything");
      }
    };
    return Radio;
  })();
  Model.Song = (function() {
    function Song(artist, title, album, listenedAt) {
      this.artist = artist;
      this.title = title;
      this.album = album != null ? album : null;
      this.listenedAt = listenedAt;
      if (!(this.listenedAt != null)) {
        this.listenedAt = Math.round(Date.now() / 1000);
      }
      this.resources = null;
    }
    Song.prototype.toString = function() {
      return "Song[" + this.artist + " - " + this.title + " - " + this.album + "]";
    };
    return Song;
  })();
  Model.SongResource = (function() {
    function SongResource() {
      this.length = null;
    }
    SongResource.prototype.getPlayingPosition = function() {
      throw E;
    };
    return SongResource;
  })();
  Model.SongFeed = (function() {
    function SongFeed() {
      this._eventListeners = [];
    }
    SongFeed.prototype.hasOpenEnd = function() {
      throw EOVR;
    };
    SongFeed.prototype.hasNext = function() {
      throw EOVR;
    };
    SongFeed.prototype.next = function() {
      throw EOVR;
    };
    SongFeed.prototype.registerListener = function(listener) {
      return this._eventListeners.push(listener);
    };
    return SongFeed;
  })();
  Model.SequentialSongFeedCombinator = (function() {
    __extends(SequentialSongFeedCombinator, Model.SongFeed);
    function SequentialSongFeedCombinator() {
      var feeds;
      feeds = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      this.feeds = feeds;
      SequentialSongFeedCombinator.__super__.constructor.call(this);
      if (this.feeds.length === 0) throw new Error("no feeds given!");
      this.feededCount = 0;
      this._currentFeedIdx = 0;
    }
    SequentialSongFeedCombinator.prototype.hasOpenEnd = function() {
      return this.feeds[this.feeds.length - 1].hasOpenEnd();
    };
    SequentialSongFeedCombinator.prototype.hasNext = function() {
      var hasNext;
      hasNext = this.feeds[this._currentFeedIdx].hasNext();
      if (!hasNext && !this.feeds[this._currentFeedIdx].hasOpenEnd() && this._currentFeedIdx < this.feeds.length - 1) {
        this._currentFeedIdx++;
        return this.hasNext();
      } else {
        return hasNext;
      }
    };
    SequentialSongFeedCombinator.prototype.next = function() {
      this.feededCount++;
      return this.feeds[this._currentFeedIdx].next();
    };
    SequentialSongFeedCombinator.prototype.addFeed = function(feed) {
      return this.feeds.push(feed);
    };
    return SequentialSongFeedCombinator;
  })();
  Model.AlternatingSongFeedCombinator = (function() {
    __extends(AlternatingSongFeedCombinator, Model.SongFeed);
    function AlternatingSongFeedCombinator() {
      var feeds, songsPerFeedInARow;
      songsPerFeedInARow = arguments[0], feeds = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      this.songsPerFeedInARow = songsPerFeedInARow != null ? songsPerFeedInARow : 1;
      this.feeds = feeds;
      AlternatingSongFeedCombinator.__super__.constructor.call(this);
      this.feededCount = 0;
      this._currentFeedIdx = 0;
      this._currentFeedSongsInARow = 0;
    }
    AlternatingSongFeedCombinator.prototype.hasOpenEnd = function() {
      return this.feeds.some(function(feed) {
        return feed.hasOpenEnd();
      });
    };
    AlternatingSongFeedCombinator.prototype.hasNext = function() {
      var oldFeedIdx, startIdx;
      if (this.feeds.length === 0) return false;
      if (this._currentFeedSongsInARow < this.songsPerFeedInARow && this.feeds[this._currentFeedIdx].hasNext()) {
        return true;
      }
      oldFeedIdx = this._currentFeedIdx;
      this._moveToNextFeed();
      startIdx = this._currentFeedIdx;
      while (!this.feeds[this._currentFeedIdx].hasNext()) {
        if (this.feeds.length === 0) return false;
        this._moveToNextFeed();
        if (this._currentFeedIdx === startIdx) return false;
      }
      if (oldFeedIdx !== this._currentFeedIdx) this._currentFeedSongsInARow = 0;
      return true;
    };
    AlternatingSongFeedCombinator.prototype._moveToNextFeed = function() {
      return this._currentFeedIdx = this._currentFeedIdx === this.feeds.length - 1 ? 0 : this._currentFeedIdx + 1;
    };
    AlternatingSongFeedCombinator.prototype.next = function() {
      var listener, song, _i, _len, _ref;
      this._currentFeedSongsInARow++;
      song = this.feeds[this._currentFeedIdx].next();
      this.feededCount++;
      _ref = this._eventListeners;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        listener("nextSongReturned", {
          feed: this.feeds[this._currentFeedIdx],
          song: song
        });
      }
      return song;
    };
    AlternatingSongFeedCombinator.prototype.addFeed = function(feed) {
      this.feeds.push(feed);
      return console.debug("feed added");
    };
    AlternatingSongFeedCombinator.prototype.removeFeed = function(feedToRemove) {
      if (!this.feeds.some(function(feed) {
        return feed === feedToRemove;
      })) {
        throw new Error("feed cannot be removed (not found)");
      }
      this.feeds = this.feeds.filter(function(feed) {
        return feed !== feedToRemove;
      });
      this._currentFeedIdx = 0;
      console.debug("feed removed");
      return this._currentFeedSongsInARow = 0;
    };
    return AlternatingSongFeedCombinator;
  })();
  Model.SongFeedStream = (function() {
    function SongFeedStream(songFeed, streamingNetworks, preloadCount) {
      var network, _i, _len, _ref;
      this.songFeed = songFeed;
      this.streamingNetworks = streamingNetworks;
      this.preloadCount = preloadCount != null ? preloadCount : 1;
      this._handleStreamingNetworkEvent = __bind(this._handleStreamingNetworkEvent, this);
      _ref = this.streamingNetworks;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        network = _ref[_i];
        network.registerListener(this._handleStreamingNetworkEvent);
      }
      this.stopRequest = false;
      this.queue = [];
      this._eventListeners = [];
      this._stopRequestCall = function() {};
    }
    SongFeedStream.prototype.registerListener = function(listener) {
      return this._eventListeners.push(listener);
    };
    SongFeedStream.prototype.stopStreaming = function() {
      var listener, _i, _len, _ref;
      this.stopRequest = true;
      console.log("stop request received");
      _ref = this._eventListeners;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        listener("streamingStoppedByRequest");
      }
      return this._stopRequestCall();
    };
    SongFeedStream.prototype.startStreaming = function() {
      var lastSongReceivedAt, lastSongStreamedNetwork, listener, network, preferredResource, rv, song, _i, _len, _ref, _results;
      this.stopRequest = false;
      lastSongReceivedAt = -1;
      lastSongStreamedNetwork = null;
      waitfor {
        _results = [];
        while (true) {
          console.log("next iteration");
          if (this.stopRequest) {
            return {
              status: "stopRequest"
            };
          }
          if (!this.songFeed.hasNext()) {
            if (this.songFeed.hasOpenEnd()) {
              console.log("holding..15secs");
              hold(15000);
              continue;
            } else {
              console.info("end of feed, all available songs streamed");
              return {
                status: "endOfFeed"
              };
            }
          } else {
            song = this.songFeed.next();
            console.log("next: " + song);
            lastSongReceivedAt = Date.now();
            if (this._findAndAddSongResources(song)) {
              preferredResource = this._getPreferredResource(song.resources, lastSongStreamedNetwork);
              network = this.streamingNetworks.filter(function(network) {
                return network.canPlay(preferredResource);
              })[0];
              if (network.enqueue && lastSongStreamedNetwork === network && this.queue.length > 0) {
                this.queue.push({
                  song: song,
                  resource: preferredResource
                });
                network.enqueue(preferredResource);
                if (this.songFeed.hasOpenEnd() || this.preloadCount === 0) {
                  console.log("waiting");
                  _results.push(this._waitUntilEndOfQueue(0.9));
                } else {
                  console.log("waiting until queue gets smaller (then: preload new song)");
                  _results.push(this._waitUntilQueueLessThanOrEqual(this.preloadCount));
                }
              } else {
                console.log("waiting 2");
                this._waitUntilEndOfQueue(1.0);
                this.queue.push({
                  song: song,
                  resource: preferredResource
                });
                _ref = this._eventListeners;
                for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                  listener = _ref[_i];
                  listener("songPlaying", song);
                }
                network.play(preferredResource);
                lastSongStreamedNetwork = network;
                if (!network.enqueue || this.songFeed.hasOpenEnd() || this.preloadCount === 0) {
                  console.log("waiting 3");
                  _results.push(this._waitUntilEndOfQueue(0.9));
                } else {
                  _results.push(void 0);
                }
              }
            } else {
              continue;
            }
          }
        }
        return _results;
      }
      or {
        waitfor (rv) {
          this._stopRequestCall = resume;
        }
        return {
          status: "stopRequest"
        };
      }
    };
    SongFeedStream.prototype._waitUntilQueueLessThanOrEqual = function(count) {
      var _results;
      _results = [];
      while (this.queue.length > count) {
        console.debug("holding on... " + this.queue.length + " songs in queue (target: " + count + ")");
        _results.push(hold(5000));
      }
      return _results;
    };
    SongFeedStream.prototype._waitUntilEndOfQueue = function(factor) {
      var length, position, songEndsIn, waitingResource;
      this._waitUntilQueueLessThanOrEqual(1);
      if (this.queue.length === 0) return;
      console.debug("holding on.. until song nearly finished");
      waitingResource = this.queue[0].resource;
      while (this.queue.length === 1 && this.queue[0].resource === waitingResource) {
        length = waitingResource.length;
        position = waitingResource.getPlayingPosition();
        console.debug("length: " + length + ", position: " + position);
        if ((length != null) && (position != null)) {
          songEndsIn = Math.round(factor * waitingResource.length - waitingResource.getPlayingPosition());
          console.debug("songEndsIn: " + songEndsIn);
          if (songEndsIn < 0) {
            break;
          } else if (songEndsIn < 10000) {
            hold(songEndsIn);
            break;
          }
        }
        hold(5000);
      }
      if (this.queue.length !== 1) {
        console.warn("queue length changed to " + this.queue.length);
      }
      if (this.queue > 0 && this.queue[0].resource !== waitingResource) {
        return console.warn("resource on which we are waiting for changed to " + this.waitingResource);
      }
    };
    SongFeedStream.prototype._findAndAddSongResources = function(song) {
      var network, resources;
      if (song.resources === null) {
        resources = (function() {
          var _i, _len, _ref, _results;
          _ref = this.streamingNetworks;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            network = _ref[_i];
            _results.push(network.findSongResource(song.artist, song.title, song.album));
          }
          return _results;
        }).call(this);
        song.resources = resources.filter(function(resource) {
          return resource != null;
        });
      }
      return song.resources.length > 0;
    };
    SongFeedStream.prototype._getPreferredResource = function(resources, preferredNetwork) {
      var matchingResource;
      if (!(preferredNetwork != null)) {
        return resources[0];
      } else {
        matchingResource = resources.filter(__bind(function(resource) {
          var network;
          network = this.streamingNetworks.filter(function(network) {
            return network.canPlay(resource);
          })[0];
          return network === preferredNetwork;
        }, this));
        if (matchingResource.length === 0) {
          return resources[0];
        } else {
          return matchingResource[0];
        }
      }
    };
    SongFeedStream.prototype._handleStreamingNetworkEvent = function(name, data) {
      var listener, _i, _j, _len, _len2, _ref, _ref2, _results, _results2;
      if (["streamingSkipped", "streamingCompleted", "streamingFailed"].indexOf(name) !== -1 && this.queue[0].resource === data) {
        if (name === "streamingSkipped") {
          console.log("song skipped, shifting");
        } else if (name === "streamingCompleted") {
          console.log("song completed, shifting");
        } else if (name === "streamingFailed") {
          console.log("song failed to play, shifting");
        }
        this.queue.shift();
        if (this.queue.length > 0) {
          _ref = this._eventListeners;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            listener = _ref[_i];
            _results.push(listener("songPlaying", this.queue[0].song));
          }
          return _results;
        } else {
          _ref2 = this._eventListeners;
          _results2 = [];
          for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
            listener = _ref2[_j];
            _results2.push(listener("nothingPlaying"));
          }
          return _results2;
        }
      }
    };
    SongFeedStream.prototype.dispose = function() {
      var network, _i, _len, _ref;
      if (!this.stopRequest) {
        throw new Error("can only dispose after streaming was stopped");
      }
      _ref = this.streamingNetworks;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        network = _ref[_i];
        network.removeListener(this._handleStreamingNetworkEvent);
      }
      return this._eventListeners = [];
    };
    return SongFeedStream;
  })();
  Model.StreamingNetwork = (function() {
    function StreamingNetwork() {
      this.eventListeners = [];
    }
    StreamingNetwork.prototype.registerListener = function(listener) {
      return this.eventListeners.push(listener);
    };
    StreamingNetwork.prototype.removeListener = function(listenerToBeRemoved) {
      return this.eventListeners = this.eventListeners.filter(function(listener) {
        return listener !== listenerToBeRemoved;
      });
    };
    StreamingNetwork.prototype.findSongResource = function(artist, title) {
      throw new Error("must be overriden");
    };
    StreamingNetwork.prototype.canPlay = function(songResource) {
      throw new Error("must be overriden");
    };
    StreamingNetwork.prototype.play = function(songResource) {
      throw new Error("must be overriden");
    };
    StreamingNetwork.prototype.stop = function() {
      throw new Error("must be overriden");
    };
    return StreamingNetwork;
  })();
  Model.GroovesharkSongResource = (function() {
    __extends(GroovesharkSongResource, Model.SongResource);
    function GroovesharkSongResource(songId, groovesharkNetwork) {
      this.songId = songId;
      this.groovesharkNetwork = groovesharkNetwork;
      GroovesharkSongResource.__super__.constructor.call(this);
    }
    GroovesharkSongResource.prototype.getPlayingPosition = function() {
      return this.groovesharkNetwork.getPlayingPosition(this);
    };
    GroovesharkSongResource.prototype.toString = function() {
      return "GroovesharkSongResource[songId: " + this.songId + "]";
    };
    return GroovesharkSongResource;
  })();
  Model.GroovesharkStreamingNetwork = (function() {
    __extends(GroovesharkStreamingNetwork, Model.StreamingNetwork);
    function GroovesharkStreamingNetwork() {
      this.handleGroovesharkEvent = __bind(this.handleGroovesharkEvent, this);      GroovesharkStreamingNetwork.__super__.constructor.call(this);
      waitfor {
        while (!(typeof Grooveshark !== "undefined" && Grooveshark !== null)) {
          console.debug("Grooveshark JS API not available yet, waiting...");
          hold(500);
        }
      }
      or {
        hold(10000);
        throw new Error("Grooveshark JS API not available");
      }
      if (!((Grooveshark.addSongsByID != null) && (Grooveshark.setSongStatusCallback != null) && (Grooveshark.pause != null) && (Grooveshark.removeCurrentSongFromQueue != null))) {
        throw new Error("Grooveshark API has changed");
      }
      Grooveshark.setSongStatusCallback(this.handleGroovesharkEvent);
      spawn(this._doPeriodicCleanup());
    }
    GroovesharkStreamingNetwork.prototype.findSongResource = function(artist, title, album) {
      var albumParam, response, url;
      if (album == null) album = null;
      albumParam = album != null ? "&album=" + album : "";
      url = http.constructURL("http://buddyradioproxy.appspot.com/tinysong?artist=" + artist + "&title=" + title + albumParam);
      response = http.json(url);
      if (response.SongID != null) {
        return new Model.GroovesharkSongResource(response.SongID, this);
      } else {
        console.warn("no result from tinysong for: " + artist + " - " + title);
        if (response.error != null) console.error("error was: " + response.error);
        return null;
      }
    };
    GroovesharkStreamingNetwork.prototype.canPlay = function(songResource) {
      return songResource instanceof Model.GroovesharkSongResource;
    };
    GroovesharkStreamingNetwork.prototype.queuedSongResources = [];
    GroovesharkStreamingNetwork.prototype.currentSongShouldHaveStartedAt = null;
    GroovesharkStreamingNetwork.prototype.lastFailedSongResource = null;
    GroovesharkStreamingNetwork.prototype.play = function(songResource, dontRetry) {
      var listener, _i, _j, _len, _len2, _ref, _ref2;
      if (dontRetry == null) dontRetry = false;
      console.debug("playing... Grooveshark songID " + songResource.songId);
      Grooveshark.addSongsByID([songResource.songId]);
      if (!this._skipTo(songResource.songId)) {
        if (dontRetry) {
          _ref = this.eventListeners;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            listener = _ref[_i];
            listener("streamingSkipped", songResource);
          }
          return;
        }
        console.info("trying to add song one more time...");
        Grooveshark.addSongsByID([songResource.songId]);
        if (!this._skipTo(songResource.songId)) {
          console.error("nope, still not working... skipping this song now");
          _ref2 = this.eventListeners;
          for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
            listener = _ref2[_j];
            listener("streamingSkipped", songResource);
          }
          return;
        }
      }
      this.currentSongShouldHaveStartedAt = Date.now();
      this.queuedSongResources.push(songResource);
      return this._playIfPaused();
    };
    GroovesharkStreamingNetwork.prototype._skipTo = function(songId) {
      var _ref;
      waitfor {
        while (((_ref = Grooveshark.getCurrentSongStatus().song) != null ? _ref.songID : void 0) !== songId) {
          console.debug("skipping to next song to get to the current one");
          Grooveshark.next();
          hold(1000);
        }
        return true;
      }
      or {
        hold(10000);
        console.warn("couldn't skip to current song in Grooveshark player");
        return false;
      }
    };
    GroovesharkStreamingNetwork.prototype.enqueue = function(songResource) {
      this.queuedSongResources.push(songResource);
      return Grooveshark.addSongsByID([songResource.songId]);
    };
    GroovesharkStreamingNetwork.prototype.getPlayingPosition = function(songResource) {
      var gsSong, resources;
      gsSong = Grooveshark.getCurrentSongStatus().song;
      if ((gsSong != null) && gsSong.songID === songResource.songId) {
        resources = this.queuedSongResources.filter(function(resource) {
          return resource === songResource;
        });
        if (resources.length === 1 && (resources[0].length != null) && Math.round(gsSong.calculatedDuration) > resources[0].length) {
          console.debug("song length corrected from " + resources[0].length + "ms to " + (Math.round(gsSong.calculatedDuration)) + "ms");
          resources[0].length = Math.round(gsSong.calculatedDuration);
        }
        return gsSong.position;
      } else {
        return null;
      }
    };
    GroovesharkStreamingNetwork.prototype._doPeriodicCleanup = function() {
      var _results;
      _results = [];
      while (true) {
        this._cleanup();
        _results.push(hold(5000));
      }
      return _results;
    };
    GroovesharkStreamingNetwork.prototype._cleanup = function() {
      var listener, oldDate, resource, _i, _len, _ref, _ref2, _results;
      if (this.queuedSongResources.length > 0 && !(this.queuedSongResources[0].length != null) && (this.currentSongShouldHaveStartedAt != null)) {
        if ((Date.now() - this.currentSongShouldHaveStartedAt) > 10000) {
          console.warn("grooveshark got stuck... trying to re-add current song");
          resource = this.queuedSongResources.shift();
          oldDate = this.currentSongShouldHaveStartedAt;
          if (((_ref = Grooveshark.getCurrentSongStatus().song) != null ? _ref.songID : void 0) === resource.songId) {
            Grooveshark.removeCurrentSongFromQueue();
          }
          this.play(resource, true);
          return this.currentSongShouldHaveStartedAt = oldDate;
        } else if ((Date.now() - this.currentSongShouldHaveStartedAt) > 25000) {
          console.warn("grooveshark got stuck... giving up. skipping song and fixing queue");
          resource = this.queuedSongResources.shift();
          _ref2 = this.eventListeners;
          _results = [];
          for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
            listener = _ref2[_i];
            _results.push(listener("streamingSkipped", resource));
          }
          return _results;
        }
      }
    };
    GroovesharkStreamingNetwork.prototype.stop = function() {
      Grooveshark.pause();
      return this.queuedSongResources = [];
    };
    GroovesharkStreamingNetwork.prototype._playIfPaused = function() {
      var _results;
      _results = [];
      while (["paused", "none"].indexOf(Grooveshark.getCurrentSongStatus().status) !== -1) {
        Grooveshark.play();
        _results.push(hold(1000));
      }
      return _results;
    };
    GroovesharkStreamingNetwork.prototype.handleGroovesharkEvent = function(data) {
      var listener, resource, song, status, _i, _j, _k, _len, _len2, _len3, _ref, _ref2, _ref3, _results;
      status = data.status;
      song = data.song;
      console.debug("GS: " + status + ", song id: " + (song != null ? song.songID : void 0) + ", calculated duration: " + (song != null ? song.calculatedDuration : void 0) + ", estimated duration: " + (song != null ? song.estimateDuration : void 0));
      if (!this.queuedSongResources.some(function(resource) {
        return resource.songId === (song != null ? song.songID : void 0);
      })) {
        return;
      }
      if (song.calculatedDuration !== 0) {
        resource = this.queuedSongResources.filter(function(resource) {
          return resource.songId === song.songID;
        })[0];
        if (resource.length != null) {
          if (Math.round(song.calculatedDuration) > resource.length) {
            console.debug("song length corrected from " + resource.length + "ms to " + (Math.round(song.calculatedDuration)) + "ms");
            resource.length = Math.round(song.calculatedDuration);
          }
        } else {
          resource.length = Math.round(song.calculatedDuration);
          console.debug("song length set to " + resource.length + " ms (songId " + song.songID + ")");
        }
      }
      while (this.queuedSongResources[0].songId !== song.songID) {
        resource = this.queuedSongResources.shift();
        _ref = this.eventListeners;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          listener("streamingSkipped", resource);
        }
        this.currentSongShouldHaveStartedAt = Date.now();
      }
      if (["completed", "failed"].indexOf(status) !== -1) {
        if (this.queuedSongResources.length > 0) {
          this.currentSongShouldHaveStartedAt = Date.now();
        }
        resource = this.queuedSongResources.shift();
        _ref2 = this.eventListeners;
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          listener = _ref2[_j];
          listener("streamingCompleted", resource);
        }
      }
      if (status === "failed") {
        if (this.lastFailedSongResource === this.queuedSongResources[0]) {
          _ref3 = this.eventListeners;
          _results = [];
          for (_k = 0, _len3 = _ref3.length; _k < _len3; _k++) {
            listener = _ref3[_k];
            _results.push(listener("streamingFailed", this.lastFailedSongResource));
          }
          return _results;
        } else {
          resource = this.queuedSongResources.shift();
          this.lastFailedSongResource = resource;
          return this.play(resource, true);
        }
      }
    };
    return GroovesharkStreamingNetwork;
  })();
  Model.LastFmBuddyNetwork = (function() {
    __extends(LastFmBuddyNetwork, Model.BuddyNetwork);
    LastFmBuddyNetwork.prototype.name = "Last.fm";
    LastFmBuddyNetwork.prototype.className = "Model.LastFmBuddyNetwork";
    function LastFmBuddyNetwork() {
      spawn(this._periodicUpdate());
    }
    LastFmBuddyNetwork.prototype._periodicUpdate = function() {
      var username, _i, _len, _ref;
      while (true) {
        _ref = Object.keys(this._eventListeners);
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          username = _ref[_i];
          this._updateListeningData(username);
        }
        hold(60000);
      }
      return null;
    };
    LastFmBuddyNetwork.prototype._rateLimiter = new Model.APIRateLimiter(500, 300);
    LastFmBuddyNetwork.prototype._buddyCache = {};
    LastFmBuddyNetwork.prototype._buddyListeningCache = {};
    LastFmBuddyNetwork.prototype._eventListeners = {};
    LastFmBuddyNetwork.prototype.isValid = function(username) {
      var user;
      if (this._buddyCache.hasOwnProperty(username.toLowerCase())) return true;
      try {
        user = LastFmApi.get({
          method: "user.getInfo",
          user: username
        });
        this._buddyCache[user.name.toLowerCase()] = {
          name: user.name,
          avatarUrl: user.image[0]["#text"],
          profileUrl: user.url
        };
        return true;
      }
      catch (e) {
        return false;
      }
    };
    LastFmBuddyNetwork.prototype._throwIfInvalid = function(username) {
      if (!this.isValid(username)) {
        throw new Error("" + username + " not existing on Last.fm");
      }
    };
    LastFmBuddyNetwork.prototype.getBuddies = function(username) {
      var friends;
      try {
        friends = LastFmApi.get({
          method: "user.getFriends",
          user: username
        }).user;
        return friends.map(function(friend) {
          return friend.name;
        });
      }
      catch (e) {
        if (e.code === 6) {
          return {
            error: "invalid_user"
          };
        }
        return {
          error: "unknown_error"
        };
      }
    };
    LastFmBuddyNetwork.prototype.getInfo = function(username) {
      var user;
      user = username.toLowerCase();
      this._throwIfInvalid(user);
      this._updateListeningData(user);
      return this._buddyCache[user];
    };
    LastFmBuddyNetwork.prototype.getStatus = function(username) {
      this._throwIfInvalid(username);
      this._updateListeningData(username.toLowerCase());
      return this._buddyListeningCache[username.toLowerCase()].status;
    };
    LastFmBuddyNetwork.prototype.getLastSong = function(username) {
      var user;
      user = username.toLowerCase();
      this._throwIfInvalid(user);
      this._updateListeningData(user);
      return this._doGetLastSong(user);
    };
    LastFmBuddyNetwork.prototype._doGetLastSong = function(username) {
      if (this._buddyListeningCache[username].status === "live") {
        return this._buddyListeningCache[username].currentSong;
      } else if (this._buddyListeningCache[username].pastSongs.length > 0) {
        return this._buddyListeningCache[username].pastSongs[0];
      } else {
        return null;
      }
    };
    LastFmBuddyNetwork.prototype._getPastSongs = function(username) {
      this._throwIfInvalid(username);
      return this._buddyListeningCache[username.toLowerCase()].pastSongs;
    };
    LastFmBuddyNetwork.prototype.getLiveFeed = function(username) {
      return new Model.LastFmLiveSongFeed(username, this);
    };
    LastFmBuddyNetwork.prototype.getHistoricFeed = function(username, from, to) {
      if (!(from != null) || !(to != null)) throw new Error("wrong parameters");
      return new Model.LastFmHistoricSongFeed(username, this, from, to);
    };
    LastFmBuddyNetwork.prototype.hasHistoricData = function(username, date) {
      var from, response, to;
      try {
        from = Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0) / 1000);
        to = Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59) / 1000);
        response = LastFmApi.get({
          method: "user.getRecentTracks",
          user: username,
          from: from,
          to: to,
          limit: 1
        });
        if (!(response.track != null)) return false;
        if (!(response.track instanceof Array)) response.track = [response.track];
        return response.track.some(function(track) {
          var _ref;
          return !((_ref = track["@attr"]) != null ? _ref.nowplaying : void 0);
        });
      }
      catch (e) {
        if (e.code === 4) {
          return false;
        } else {
          throw e;
        }
      }
    };
    LastFmBuddyNetwork.prototype.registerListener = function(listener, username) {
      var user;
      user = username.toLowerCase();
      if (!this._eventListeners.hasOwnProperty(user)) {
        this._eventListeners[user] = [];
      }
      return this._eventListeners[user].push(listener);
    };
    LastFmBuddyNetwork.prototype._notifyListeners = function(username, name, data) {
      var listener, _i, _len, _ref, _results;
      if (!this._eventListeners.hasOwnProperty(username)) return;
      console.debug("last.fm notify: " + username + " " + name + " " + data);
      _ref = this._eventListeners[username];
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        _results.push(listener(name, data));
      }
      return _results;
    };
    LastFmBuddyNetwork.prototype.removeListener = function(listenerToBeRemoved, username) {
      var listener;
      return this._eventListeners[username.toLowerCase()] = (function() {
        var _i, _len, _ref, _results;
        _ref = this._eventListeners[username.toLowerCase()];
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          if (listener !== listenerToBeRemoved) _results.push(listener);
        }
        return _results;
      }).call(this);
    };
    LastFmBuddyNetwork.prototype.forceUpdateListeningData = function(username) {
      return this._updateListeningData(username.toLowerCase(), 1000);
    };
    LastFmBuddyNetwork.prototype._updateListeningData = function(username, cacheLifetime) {
      var cache, currentSong, lastUpdate, newCurrentSong, newLastSong, oldLastSong, pastSongs, response, status, track, tracks;
      if (cacheLifetime == null) cacheLifetime = 30000;
      cache = this._buddyListeningCache.hasOwnProperty(username) ? this._buddyListeningCache[username] : null;
      lastUpdate = cache != null ? cache.lastUpdate : 0;
      if ((Date.now() - lastUpdate) < cacheLifetime) return;
      if (!this._rateLimiter.canSend()) {
        console.warn("Last.fm API rate limit exceeded, skipping update of " + username + "'s listening data");
        return;
      }
      console.info("getting recent tracks and status from Last.fm for " + username);
      response = null;
      try {
        this._rateLimiter.count();
        response = LastFmApi.get({
          method: "user.getRecentTracks",
          user: username
        });
      }
      catch (e) {
        if (e.code === 4) {
          if ((cache != null ? cache.status : void 0) !== "disabled") {
            this._notifyListeners(username, "statusChanged", "disabled");
          }
          this._buddyListeningCache[username] = {
            lastUpdate: Date.now(),
            status: "disabled",
            currentSong: null,
            pastSongs: []
          };
        } else {
          console.error(e);
        }
        return;
      }
      tracks = response.track || [];
      currentSong = ((function() {
        var _i, _len, _ref, _ref2, _results;
        _results = [];
        for (_i = 0, _len = tracks.length; _i < _len; _i++) {
          track = tracks[_i];
          if ((_ref = track["@attr"]) != null ? _ref.nowplaying : void 0) {
            _results.push(new Model.Song(track.artist["#text"], track.name, (_ref2 = track.album) != null ? _ref2["#text"] : void 0));
          }
        }
        return _results;
      })())[0];
      pastSongs = (function() {
        var _i, _len, _ref, _ref2, _results;
        _results = [];
        for (_i = 0, _len = tracks.length; _i < _len; _i++) {
          track = tracks[_i];
          if (!((_ref = track["@attr"]) != null ? _ref.nowplaying : void 0)) {
            _results.push(new Model.Song(track.artist["#text"], track.name, (_ref2 = track.album) != null ? _ref2["#text"] : void 0, track.date.uts));
          }
        }
        return _results;
      })();
      status = currentSong != null ? "live" : "off";
      if (status !== (cache != null ? cache.status : void 0)) {
        this._notifyListeners(username, "statusChanged", status);
      }
      if (status === "off" && (cache != null ? cache.status : void 0) === "live" && (Date.now() - cache.lastUpdate) < 10000) {
        return console.debug("" + username + " went off in the last 10s, will update when >10s");
      } else {
        newCurrentSong = cache != null ? cache.currentSong : void 0;
        if (((cache != null ? cache.currentSong : void 0) != null) && (currentSong != null)) {
          if (cache.currentSong.artist !== currentSong.artist || cache.currentSong.title !== currentSong.title || (cache.pastSongs.length > 0 && cache.pastSongs[0].listenedAt !== pastSongs[0].listenedAt)) {
            newCurrentSong = currentSong;
          }
        } else {
          newCurrentSong = currentSong;
        }
        oldLastSong = cache != null ? this._doGetLastSong(username) : null;
        this._buddyListeningCache[username] = {
          lastUpdate: Date.now(),
          status: status,
          currentSong: newCurrentSong,
          pastSongs: pastSongs
        };
        newLastSong = this._doGetLastSong(username);
        if ((oldLastSong != null) && (newLastSong != null)) {
          if (oldLastSong.listenedAt !== newLastSong.listenedAt) {
            return this._notifyListeners(username, "lastSongChanged", newLastSong);
          }
        } else if (oldLastSong !== newLastSong) {
          return this._notifyListeners(username, "lastSongChanged", newLastSong);
        }
      }
    };
    return LastFmBuddyNetwork;
  })();
  Model.LastFmSongFeed = (function() {
    __extends(LastFmSongFeed, Model.SongFeed);
    function LastFmSongFeed() {
      LastFmSongFeed.__super__.constructor.call(this);
      this.feededCount = 0;
      this._songs = [];
      this._songsQueuedLength = 0;
      this._currentSongsIdx = -1;
      this._endOfFeedEventSent = false;
    }
    LastFmSongFeed.prototype.hasNext = function() {
      var listener, _i, _len, _ref;
      if (this._songsQueuedLength === 0) this._updateFeed();
      if (this._songsQueuedLength === 0 && !this.hasOpenEnd() && !this._endOfFeedEventSent) {
        _ref = this._eventListeners;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          listener("endOfFeed", this);
        }
        this._endOfFeedEventSent = true;
      }
      return this._songsQueuedLength > 0;
    };
    LastFmSongFeed.prototype.next = function() {
      if (this._songsQueuedLength === 0) {
        throw new Error("no more songs available!");
      }
      this.feededCount++;
      this._currentSongsIdx++;
      this._songsQueuedLength--;
      console.debug("feed queue: " + this._songs.slice(this._currentSongsIdx, this._songs.length));
      return this._songs[this._currentSongsIdx];
    };
    LastFmSongFeed.prototype._addSong = function(song) {
      this._songs.push(song);
      return this._songsQueuedLength++;
    };
    LastFmSongFeed.prototype._updateFeed = function() {
      throw EOVR;
    };
    return LastFmSongFeed;
  })();
  Model.LastFmLiveSongFeed = (function() {
    __extends(LastFmLiveSongFeed, Model.LastFmSongFeed);
    function LastFmLiveSongFeed(username, lastFmNetwork) {
      var pastSongs;
      this.username = username;
      this.lastFmNetwork = lastFmNetwork;
      LastFmLiveSongFeed.__super__.constructor.call(this);
      this.notEarlierThan = 0;
      pastSongs = this.lastFmNetwork._getPastSongs(this.username);
      if (pastSongs.length > 0) this.notEarlierThan = pastSongs[0].listenedAt + 1;
    }
    LastFmLiveSongFeed.prototype.hasOpenEnd = function() {
      return true;
    };
    LastFmLiveSongFeed.prototype._updateFeed = function() {
      this._mergeNewSongs();
      if (this._songsQueuedLength === 0) {
        this.lastFmNetwork.forceUpdateListeningData(this.username);
        return this._mergeNewSongs();
      }
    };
    LastFmLiveSongFeed.prototype._mergeNewSongs = function() {
      var currentSong, newIdx, newStartIdx, oldIdx, oldIdxPart, oldSongsKept, pastSongs, previousNewIdx, songsToCheck, status;
      status = this.lastFmNetwork.getStatus(this.username);
      if (status === "disabled") return;
      currentSong = status === "live" ? this.lastFmNetwork.getLastSong(this.username) : null;
      if (this._songs.length === 0) {
        if (currentSong != null) this._addSong(currentSong);
        return;
      }
      if (this._songs[this._songs.length - 1] === currentSong) return;
      pastSongs = this.lastFmNetwork._getPastSongs(this.username).slice();
      songsToCheck = pastSongs.reverse();
      while (songsToCheck.length > 0 && songsToCheck[0].listenedAt < this.notEarlierThan) {
        songsToCheck.shift();
      }
      if (status === "live") songsToCheck.push(currentSong);
      if (songsToCheck.length === 0) return;
      if (songsToCheck.length > 5) {
        songsToCheck = songsToCheck.slice(songsToCheck.length - 5);
      }
      oldIdxPart = this._songs.length - 1 - songsToCheck.length;
      oldIdx = oldIdxPart > 0 ? oldIdxPart : 0;
      newIdx = 0;
      console.debug("songsToCheck: " + songsToCheck);
      console.debug("_songs: " + this._songs);
      while (oldIdx < this._songs.length && newIdx !== songsToCheck.length) {
        console.debug("pre-loop: oldIdx: " + oldIdx + ", newIdx: " + newIdx);
        previousNewIdx = newIdx;
        while (newIdx < songsToCheck.length && (this._songs[oldIdx].artist !== songsToCheck[newIdx].artist || this._songs[oldIdx].title !== songsToCheck[newIdx].title)) {
          console.debug("oldIdx: " + oldIdx + ", newIdx: " + newIdx);
          newIdx++;
        }
        if (newIdx === songsToCheck.length) {
          if (previousNewIdx === 0) {
            newIdx = 0;
          } else {
            newIdx = previousNewIdx;
          }
        } else {
          newIdx++;
        }
        oldIdx++;
      }
      while (newIdx < songsToCheck.length) {
        this._addSong(songsToCheck[newIdx]);
        ++newIdx;
      }
      if (this._currentSongsIdx > songsToCheck.length * 10) {
        oldSongsKept = songsToCheck.length * 2;
        newStartIdx = this._currentSongsIdx - oldSongsKept;
        this._songs = this._songs.slice(newStartIdx);
        return this._currentSongsIdx = this._currentSongsIdx - newStartIdx;
      }
    };
    return LastFmLiveSongFeed;
  })();
  Model.LastFmHistoricSongFeed = (function() {
    __extends(LastFmHistoricSongFeed, Model.LastFmSongFeed);
    function LastFmHistoricSongFeed(username, lastFmNetwork, from, to) {
      var response;
      this.username = username;
      this.lastFmNetwork = lastFmNetwork;
      this.from = from;
      this.to = to;
      LastFmHistoricSongFeed.__super__.constructor.call(this);
      response = this._getPage(1);
      if (!(response != null)) throw new Error("listening history disabled");
      this.page = response["@attr"].totalPages;
      this.totalCount = response["@attr"].total;
    }
    LastFmHistoricSongFeed.prototype.hasOpenEnd = function() {
      return false;
    };
    LastFmHistoricSongFeed.prototype._updateFeed = function() {
      var response, track, tracks, _i, _len, _ref, _ref2, _results;
      if (this.page < 1) return;
      response = this._getPage(this.page);
      if (!(response != null)) return;
      this.page--;
      if (!(response.track instanceof Array)) response.track = [response.track];
      tracks = response.track.reverse();
      _results = [];
      for (_i = 0, _len = tracks.length; _i < _len; _i++) {
        track = tracks[_i];
        if (!((_ref = track["@attr"]) != null ? _ref.nowplaying : void 0)) {
          _results.push(this._addSong(new Model.Song(track.artist["#text"], track.name, (_ref2 = track.album) != null ? _ref2["#text"] : void 0, track.date.uts)));
        }
      }
      return _results;
    };
    LastFmHistoricSongFeed.prototype._getPage = function(page) {
      try {
        return LastFmApi.get({
          method: "user.getRecentTracks",
          user: this.username,
          from: Math.round(this.from.getTime() / 1000),
          to: Math.round(this.to.getTime() / 1000),
          page: page
        });
      }
      catch (e) {
        if (e.code === 4) {
          return null;
        } else {
          throw e;
        }
      }
    };
    return LastFmHistoricSongFeed;
  })();
  View = {};
  View.Grooveshark = (function() {
    function Grooveshark(controller) {
      if ($("#header_mainNavigation").length === 1) {
        new View.GroovesharkV2(controller);
      } else if ($("#sidebar .container_inner").length === 1) {
        new View.GroovesharkV1(controller);
      } else {
        throw new Error("Couldn't detect version of Grooveshark");
      }
    }
    return Grooveshark;
  })();
  View.GroovesharkV1 = (function() {
    function GroovesharkV1(controller) {
      this.controller = controller;
      this._showMoreMenu = __bind(this._showMoreMenu, this);
      this.handleBuddyManagerEvent = __bind(this.handleBuddyManagerEvent, this);
      this.handleRadioEvent = __bind(this.handleRadioEvent, this);
      this.radio = this.controller.radio;
      this.radio.registerListener(this.handleRadioEvent);
      this.radio.buddyManager.registerListener(this.handleBuddyManagerEvent);
      this.init();
      this._cprInProgress = false;
      this._lifesLeft = 9;
      $(document).bind("DOMNodeRemoved", __bind(function(e) {
        if ($("#sidebar_buddyradio_wrapper").length === 0 && !this._cprInProgress && this._lifesLeft > 0) {
          this._cprInProgress = true;
          console.warn("OMG! We were killed!");
          hold(1000);
          this._lifesLeft--;
          console.warn("Phew... " + this._lifesLeft + " lifes left");
          this.init();
          this.refresh();
          return this._cprInProgress = false;
        }
      }, this));
    }
    GroovesharkV1.prototype.handleRadioEvent = function(name, data) {
      if (name === "tunedIn") {
        this._applyStyle(data);
      } else if (name === "nowPlaying" && data.buddy !== data.lastPlayingBuddy) {
        this._applyStyle(data.buddy);
        this._applyStyle(data.lastPlayingBuddy);
      } else if (name === "nobodyPlaying") {
        this._applyStyle(data.lastPlayingBuddy);
      } else if (name === "tunedOut") {
        this._applyStyle(data.buddy);
      } else if (name === "errorTuningIn" && data.reason === "disabled") {
        alert("Can't tune in. " + data.buddy.username + " has disabled access to his song listening data.");
      }
      if (name === "tunedOut" && data.reason === "disabled") {
        return alert("Radio for " + data.buddy.username + " was stopped because the user has disabled access to his song listening data.");
      }
    };
    GroovesharkV1.prototype.handleBuddyManagerEvent = function(name, data) {
      if (["buddyRemoved", "buddyAdded", "statusChanged", "lastSongChanged", "buddiesLoaded"].indexOf(name) !== -1) {
        this.refresh();
      }
      if (name === "buddyNotAdded") {
        if (data.reason === "notFound") {
          return alert("The buddy with username " + data.username + " couldn't be found.");
        }
      }
    };
    GroovesharkV1.prototype._applyStyle = function(buddy) {
      var classes, el;
      if (!(buddy != null)) return;
      el = $("li.sidebar_buddy[rel='" + buddy.network.className + "-" + buddy.username + "']");
      el.removeClass("buddy_nowplaying buddy_feedenabled buddy_feedenabled_historic buddy_live buddy_off buddy_disabled");
      classes = "buddy_" + buddy.listeningStatus;
      if (this.radio.isFeedEnabled(buddy)) {
        classes += " buddy_feedenabled";
        if (this.radio.getFeedType(buddy) === "historic") {
          classes += " buddy_feedenabled_historic";
        }
      }
      if (this.radio.isOnAir(buddy)) classes += " buddy_nowplaying";
      return el.addClass(classes);
    };
    GroovesharkV1.prototype.init = function() {
      var newButton;
      $("head").append("<style type=\"text/css\">\n	#sidebar_buddyradio_wrapper .divider .sidebarHeading a {\n		display: none;\n	}\n	#sidebar_buddyradio_wrapper .divider:hover .sidebarHeading a {\n		display: inline;\n	}\n	.buddyradio_overlay {\n		background: none repeat scroll 0 0 #FFFFFF;\n		border: 1px solid rgba(0, 0, 0, 0.25);\n		border-radius: 3px 3px 3px 3px;\n		padding: 5px;\n		color: black;\n		max-height: 325px;\n		overflow-x: hidden;\n		overflow-y: auto;\n		position: absolute;\n		z-index: 9999;\n	}\n	.sidebar_buddy a .icon {\n		/* Some icons by Yusuke Kamiyamane. All rights reserved. Licensed under Creative Commons Attribution 3.0. */\n		background: url(data:image/png;base64,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)\n		            no-repeat scroll 0 0 transparent;\n	}\n	.sidebar_buddy a .icon:hover, .sidebar_buddy.buddy_nowplaying.buddy_feedenabled_historic a .icon:hover {\n		background-position: -64px 0 !important;\n	}\n	.sidebar_buddy a:hover {\n		background-color: #FFDFBF;\n	}\n	.sidebar_buddy a:hover .label {\n		margin-right: 20px;\n	}\n	.sidebar_buddy a:hover .icon.remove, .sidebar_buddy a:hover .icon.remove:hover {\n		background-position: -16px -16px !important;\n		display: block;\n	}\n	.sidebar_buddy a:active {\n		background-color: #FF8000;\n	}\n	.sidebar_buddy a:active .label {\n		color: #FFFFFF !important;\n	}\n	.sidebar_buddy a:active .icon.remove, .sidebar_buddy a:active .icon.remove:hover {\n		background-position: -32px -16px !important;\n		display: block;\n	}\n	.buddy_nowplaying a .icon {\n		background-position: 0 0 !important;\n	}\n	.buddy_nowplaying.buddy_feedenabled_historic a .icon {\n		background-position: -80px -16px !important;\n	}\n	.buddy_feedenabled.buddy_feedenabled_historic a .icon {\n		background-position: -80px 0;\n	}\n	.buddy_feedenabled a .label {\n		font-weight: bold;\n	}\n	.buddy_live a .label, .buddy_live a:hover .label {\n		color: #FF8000;\n	}\n	.buddy_live a .icon {\n		background-position: -16px 0;\n	}\n	.buddy_off a .label, .buddy_off a:hover .label {\n		color: black;\n	}\n	.buddy_off a .icon {\n		background-position: -32px 0;\n	}\n	.buddy_disabled a .label, .buddy_disabled a:hover .label {\n		color: gray;\n	}\n	.buddy_disabled a .icon {\n		background-position: -48px 0;\n	}\n</style>");
      $("#sidebar .container_inner").append("<div id=\"sidebar_buddyradio_wrapper\" class=\"listWrapper\">\n            <div class=\"divider\" style=\"display: block;\">\n                <span class=\"sidebarHeading\">Buddy Radio\n			<a id=\"buddyradio_settingsLink\">Settings</a>\n		</span>\n                <a class=\"sidebarNew\"><span>Add Buddy</span></a>\n            </div>\n            <ul id=\"sidebar_buddyradio\" class=\"link_group\">\n		<li> \n			<span class=\"label ellipsis\">loading...</span>\n		</li>\n	</ul>\n        </div>");
      newButton = $("#sidebar_buddyradio_wrapper .sidebarNew");
      newButton.click(__bind(function() {
        var onConfirmAddBuddy, onConfirmImportBuddies, position;
        if ($("#buddyradio_newuserform").length === 1) {
          $("#buddyradio_newuserform").remove();
          return;
        }
        position = newButton.offset();
        $("body").append("<div id=\"buddyradio_newuserform\" style=\"position: absolute; top: " + position.top + "px; left: " + (position.left + 20) + "px; display: block;width: auto; height: 80px;\" class=\"jjmenu\">\n	<div class=\"jj_menu_item\">\n		<div style=\"width: 100px;float:left\" class=\"input_wrapper\">\n			<div class=\"cap\">\n				<input type=\"text\" id=\"buddyradio_newuser\" name=\"buddy\" /> \n			</div>\n		</div>\n		<button id=\"buddyradio_adduserbutton\" type=\"button\" class=\"btn_style1\" style=\"margin: 4px 0 0 5px\">\n			<span>Add Last.fm Buddy</span>\n		</button>\n	</div>\n	<div class=\"jj_menu_item\" style=\"clear:both\">\n		<div class=\"input_wrapper\" style=\"width: 100px; float: left;\">\n			<div class=\"cap\">\n				<input type=\"text\" name=\"buddy\" id=\"buddyradio_importusers\"> \n			</div>\n		</div>\n		<button style=\"margin: 4px 0pt 0pt 5px;\" class=\"btn_style1\" type=\"button\" id=\"buddyradio_importusersbutton\">\n			<span>Import my Last.fm Buddies</span>\n		</button>\n		\n	</div>\n</div>");
        $("#buddyradio_newuser").focus();
        onConfirmAddBuddy = __bind(function() {
          $("#buddyradio_adduserbutton span").html("Adding Buddy...");
          this.controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value);
          return $("#buddyradio_newuserform").remove();
        }, this);
        $("#buddyradio_adduserbutton").click(onConfirmAddBuddy);
        $("#buddyradio_newuser").keydown(__bind(function(event) {
          if (event.which === 13) return onConfirmAddBuddy();
        }, this));
        onConfirmImportBuddies = __bind(function() {
          var result, username;
          username = $("#buddyradio_importusers")[0].value;
          if (!username) {
            alert("You need to enter the user name from which you want to import the Last.fm buddies.");
            return;
          }
          $("#buddyradio_importusersbutton span").html("Importing Buddies...");
          result = this.controller.importBuddies("Model.LastFmBuddyNetwork", username);
          if (result.error === "invalid_user") {
            alert("The user name you entered doesn't exist on Last.fm!");
          }
          return $("#buddyradio_newuserform").remove();
        }, this);
        $("#buddyradio_importusersbutton").click(onConfirmImportBuddies);
        return $("#buddyradio_importusers").keydown(__bind(function(event) {
          if (event.which === 13) return onConfirmImportBuddies();
        }, this));
      }, this));
      return $("#buddyradio_settingsLink").click(__bind(function() {
        var optionsPreload, optionsSongsPerFeed, position, songsPerFeedInARowValues;
        if ($("#buddyradio_settingsform").length === 1) {
          $("#buddyradio_settingsform").remove();
          return;
        }
        position = newButton.offset();
        songsPerFeedInARowValues = [1, 2, 3, 4, 5, 10, 15, 20, 30, 40, 50, 100];
        optionsSongsPerFeed = this._constructOptions(songsPerFeedInARowValues, this.radio.getSongsPerFeedInARow());
        optionsPreload = this._constructOptions([0, 1, 2, 3, 4, 5], this.radio.getPreloadCount());
        $("body").append("<div id=\"buddyradio_settingsform\" style=\"position: absolute; top: " + position.top + "px; left: " + (position.left + 20) + "px; display: block;width: 310px\" class=\"buddyradio_overlay\">\n	<div>\n		Play \n		<select name=\"songsPerFeedInARow\">\n			" + optionsSongsPerFeed + "\n		</select>\n		song/s in a row from same buddy\n	</div>\n	<div style=\"margin-top: 5px\">\n		Preload\n		<select name=\"preloadCount\">\n			" + optionsPreload + "\n		</select>\n		song/s when playing historic radio\n	</div>\n	<div style=\"padding-top:10px\">\n		<button type=\"button\" class=\"btn_style1\">\n			<span>Apply</span>\n		</button>					\n	</div>\n	<div style=\"margin-top:10px; float:right; text-align:right\">\n		BuddyRadio v0.3<br />\n		<a href=\"http://neothemachine.github.com/buddyradio\" target=\"_blank\">Project Page</a>\n	</div>\n</div>");
        return $("#buddyradio_settingsform button").click(__bind(function() {
          var preloadCount, songsPerFeed;
          songsPerFeed = $("#buddyradio_settingsform select[name=songsPerFeedInARow]")[0].value;
          preloadCount = $("#buddyradio_settingsform select[name=preloadCount]")[0].value;
          this.controller.setSongsPerFeedInARow(parseInt(songsPerFeed));
          this.controller.setPreloadCount(parseInt(preloadCount));
          return $("#buddyradio_settingsform").remove();
        }, this));
      }, this));
    };
    GroovesharkV1.prototype._constructOptions = function(options, selected) {
      if (selected == null) selected = null;
      return options.map(function(n) {
        var sel;
        sel = selected === n ? " selected" : "";
        return "<option value=\"" + n + "\"" + sel + ">" + n + "</option>";
      }).join();
    };
    GroovesharkV1.prototype.refresh = function() {
      var buddy, song, sortedBuddies, status, _i, _len;
      console.debug("refreshing view");
      $("#sidebar_buddyradio").empty();
      sortedBuddies = this.radio.buddyManager.buddies.slice();
      sortedBuddies.sort(function(a, b) {
        if (a.listeningStatus === b.listeningStatus) {
          if (a.username.toLowerCase() < b.username.toLowerCase()) {
            return -1;
          } else {
            return 1;
          }
        } else if (a.listeningStatus === "live") {
          return -1;
        } else if (b.listeningStatus === "live") {
          return 1;
        } else if (a.listeningStatus === "off") {
          return -1;
        } else {
          return 1;
        }
      });
      for (_i = 0, _len = sortedBuddies.length; _i < _len; _i++) {
        buddy = sortedBuddies[_i];
        status = buddy.listeningStatus.toUpperCase();
        if ((status === "LIVE" || status === "OFF") && (buddy.lastSong != null)) {
          song = "" + buddy.lastSong.artist + " - " + buddy.lastSong.title;
          if (status === "LIVE") {
            status += ", listening to: " + song;
          } else if (status === "OFF" && (buddy.lastSong != null)) {
            status += ", last listened to: " + song;
          }
        }
        $("#sidebar_buddyradio").append("<li rel=\"" + buddy.network.className + "-" + buddy.username + "\" class=\"sidebar_buddy buddy sidebar_link\">\n	<a href=\"\">\n		<span class=\"icon remove\"></span>\n		<span class=\"icon more\"></span>\n		<span class=\"label ellipsis\" title=\"" + buddy.username + " (" + buddy.network.name + ") - " + status + "\">" + buddy.username + "</span>\n	</a>\n</li>");
        this._applyStyle(buddy);
      }
      $("li.sidebar_buddy .more").click(__bind(function(event) {
        var entry, networkClassName, username, _ref;
        event.preventDefault();
        event.stopPropagation();
        entry = $(event.currentTarget).parent().parent();
        _ref = entry.attr("rel").split("-"), networkClassName = _ref[0], username = _ref[1];
        return this._showMoreMenu(networkClassName, username);
      }, this));
      $("li.sidebar_buddy .remove").click(__bind(function(event) {
        var entry, networkClassName, username, _ref;
        event.preventDefault();
        event.stopPropagation();
        entry = $(event.currentTarget).parent().parent();
        _ref = entry.attr("rel").split("-"), networkClassName = _ref[0], username = _ref[1];
        return this.controller.removeBuddy(networkClassName, username);
      }, this));
      return $("li.sidebar_buddy").click(__bind(function(event) {
        var networkClassName, username, _ref;
        event.preventDefault();
        _ref = $(event.currentTarget).attr("rel").split("-"), networkClassName = _ref[0], username = _ref[1];
        return this.controller.tune(networkClassName, username);
      }, this));
    };
    GroovesharkV1.prototype._currentlyOpenedMenu = null;
    GroovesharkV1.prototype._showMoreMenu = function(networkClassName, username) {
      var buddy, feedInfo, feedType, position;
      buddy = this.controller.getBuddy(networkClassName, username);
      if ($("#buddyradio_more").length === 1) {
        $("#buddyradio_more").remove();
        if (this._currentlyOpenedMenu === buddy) {
          this._currentlyOpenedMenu = null;
          return;
        }
      }
      this._currentlyOpenedMenu = buddy;
      position = $("li.sidebar_buddy[rel='" + networkClassName + "-" + username + "'] .more").offset();
      if (!(position != null)) return;
      feedInfo = "";
      if (this.radio.isFeedEnabled(buddy)) {
        feedType = this.radio.getFeedType(buddy);
        feedInfo = "<div style=\"margin-bottom:10px\">Tuned into <strong>" + feedType + "</strong> radio.<br />";
        if (feedType === "historic") {
          feedInfo += "" + (this.radio.getAlreadyFeededCount(buddy)) + " of " + (this.radio.getTotalCountForHistoricFeed(buddy)) + " songs enqueued so far.";
        } else {
          feedInfo += "" + (this.radio.getAlreadyFeededCount(buddy)) + " songs enqueued so far.";
        }
        feedInfo += "</div>";
      }
      $("body").append("<div id=\"buddyradio_more\" style=\"position: absolute; top: " + position.top + "px; left: " + (position.left + 20) + "px; display: block;width: 260px\" class=\"buddyradio_overlay\">\n	" + feedInfo + "\n	<div class=\"buttons\">\n		<img style=\"float:left; padding-right:10px;\" src=\"" + buddy.avatarUrl + "\" />\n		<button type=\"button\" class=\"btn_style1 viewprofile\">\n			<span>View Profile on " + buddy.network.name + "</span>\n		</button>\n	</div>\n</div>");
      $("#buddyradio_more button.viewprofile").click(__bind(function() {
        window.open(buddy.profileUrl);
        $("#buddyradio_more").remove();
        return this._currentlyOpenedMenu = null;
      }, this));
      if (buddy.supportsHistoricFeed()) {
        $("#buddyradio_more div.buttons").append("<button style=\"margin-top: 5px\" type=\"button\" class=\"btn_style1 fetchlastweek\">\n	<span>Listen previously played songs</span>\n</button>");
        $("#buddyradio_more").append("<div class=\"lastweekdata\" style=\"clear:both\"></div>");
        return $("#buddyradio_more button.fetchlastweek").click(__bind(function() {
          var date, day, el, today, todaysDay, _ref;
          $("#buddyradio_more button.fetchlastweek span").html("Checking last week's songs...");
          el = $("#buddyradio_more .lastweekdata");
          today = new Date();
          todaysDay = today.getDate();
          for (day = todaysDay, _ref = todaysDay - 7; todaysDay <= _ref ? day < _ref : day > _ref; todaysDay <= _ref ? day++ : day--) {
            date = new Date(today.getFullYear(), today.getMonth(), day);
            if (buddy.hasHistoricData(date)) {
              el.append("<a rel=\"" + (date.getTime()) + "\">Listen songs from " + (date.toDateString()) + "</a><br />");
            } else {
              el.append("No songs played " + (date.toDateString()) + "<br />");
            }
          }
          $("#buddyradio_more button.fetchlastweek").remove();
          return $("#buddyradio_more .lastweekdata a").click(__bind(function(event) {
            var from, to;
            $("#buddyradio_more").remove();
            from = new Date(parseInt($(event.currentTarget).attr("rel")));
            to = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59);
            return this.controller.tuneHistoric(networkClassName, username, from, to);
          }, this));
        }, this));
      }
    };
    return GroovesharkV1;
  })();
  View.GroovesharkV2 = (function() {
    function GroovesharkV2(controller) {
      this.controller = controller;
      this._showMoreMenu = __bind(this._showMoreMenu, this);
      this.handleBuddyManagerEvent = __bind(this.handleBuddyManagerEvent, this);
      this.handleRadioEvent = __bind(this.handleRadioEvent, this);
      this.radio = this.controller.radio;
      this.radio.registerListener(this.handleRadioEvent);
      this.radio.buddyManager.registerListener(this.handleBuddyManagerEvent);
      this.init();
      this._cprInProgress = false;
      $(document).bind("DOMNodeRemoved", __bind(function(e) {
        if ($("#sidebar_buddyradio_wrapper").length === 0 && $("#sidebar_pinboard").length === 1 && !this._cprInProgress) {
          this._cprInProgress = true;
          hold(1000);
          this.init();
          this.refresh();
          return this._cprInProgress = false;
        }
      }, this));
    }
    GroovesharkV2.prototype.handleRadioEvent = function(name, data) {
      if (name === "tunedIn") {
        this._applyStyle(data);
      } else if (name === "nowPlaying" && data.buddy !== data.lastPlayingBuddy) {
        this._applyStyle(data.buddy);
        this._applyStyle(data.lastPlayingBuddy);
      } else if (name === "nobodyPlaying") {
        this._applyStyle(data.lastPlayingBuddy);
      } else if (name === "tunedOut") {
        this._applyStyle(data.buddy);
      } else if (name === "errorTuningIn" && data.reason === "disabled") {
        alert("Can't tune in. " + data.buddy.username + " has disabled access to his song listening data.");
      }
      if (name === "tunedOut" && data.reason === "disabled") {
        return alert("Radio for " + data.buddy.username + " was stopped because the user has disabled access to his song listening data.");
      }
    };
    GroovesharkV2.prototype.handleBuddyManagerEvent = function(name, data) {
      if (["buddyRemoved", "buddyAdded", "statusChanged", "lastSongChanged", "buddiesLoaded"].indexOf(name) !== -1) {
        this.refresh();
      }
      if (name === "buddyNotAdded") {
        if (data.reason === "notFound") {
          return alert("The buddy with username " + data.username + " couldn't be found.");
        }
      }
    };
    GroovesharkV2.prototype._applyStyle = function(buddy) {
      var classes, el;
      if (!(buddy != null)) return;
      el = $("a.sidebar_buddy[rel='" + buddy.network.className + ":" + buddy.username + "']");
      el.removeClass("buddy_nowplaying buddy_feedenabled buddy_feedenabled_historic buddy_live buddy_off buddy_disabled");
      classes = "buddy_" + buddy.listeningStatus;
      if (this.radio.isFeedEnabled(buddy)) {
        classes += " buddy_feedenabled";
        if (this.radio.getFeedType(buddy) === "historic") {
          classes += " buddy_feedenabled_historic";
        }
      }
      if (this.radio.isOnAir(buddy)) classes += " buddy_nowplaying";
      return el.addClass(classes);
    };
    GroovesharkV2.prototype.init = function() {
      var newButton;
      $("head").append("<style type=\"text/css\">\n	#sidebar_buddyradio_wrapper {\n		display: block;\n	}\n	.buddyradio_overlay {\n		background: none repeat scroll 0 0 #F5F5F5;\n		border: 1px solid rgba(0, 0, 0, 0.25);\n		border-radius: 3px 3px 3px 3px;\n		padding: 5px;\n		color: black;\n		max-height: 325px;\n		overflow-x: hidden;\n		overflow-y: auto;\n		position: absolute;\n		z-index: 9999;\n	}\n	a.sidebar_buddy .icon {\n		/* Some icons by Yusuke Kamiyamane. All rights reserved. Licensed under Creative Commons Attribution 3.0. */\n		background: url(data:image/png;base64,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)\n		            no-repeat scroll 0 0 transparent;\n	}\n	a.sidebar_buddy .icon:hover, a.sidebar_buddy.buddy_nowplaying.buddy_feedenabled_historic .icon:hover {\n		background-position: -64px 0 !important;\n	}\n	a.sidebar_buddy:hover .label {\n		margin-right: 20px;\n	}\n	a.sidebar_buddy:hover .icon.remove {\n		background-position: -48px -16px !important;\n		display: block;\n	}\n	a.sidebar_buddy:hover .icon.remove:hover {\n		background-position: -64px -16px !important;\n		display: block;\n	}\n	a.buddy_nowplaying .icon {\n		background-position: 0 0 !important;\n	}\n	a.buddy_nowplaying.buddy_feedenabled_historic .icon {\n		background-position: -80px -16px !important;\n	}\n	a.buddy_feedenabled.buddy_feedenabled_historic .icon {\n		background-position: -80px 0;\n	}\n	a.buddy_feedenabled .label {\n		font-weight: bold;\n	}\n	a.buddy_live .label, a.buddy_live:hover .label {\n		color: #FF8000;\n	}\n	a.buddy_live .icon {\n		background-position: -16px 0;\n	}\n	a.buddy_off .label, a.buddy_off:hover .label {\n		color: black;\n	}\n	a.buddy_off .icon {\n		background-position: -32px 0;\n	}\n	a.buddy_disabled .label, a.buddy_disabled:hover .label {\n		color: gray;\n	}\n	a.buddy_disabled .icon {\n		background-position: -48px 0;\n	}\n</style>");
      $("#sidebar_pinboard .overview").append("<a id=\"sidebar_buddyradio_divider\" class=\"sidebar_pin_divider\">\n	<span class=\"sidebar_pin_collapse\"></span>\n	<span class=\"sidebar_pin_heading\">Buddy Radio</span>\n</a>\n<div id=\"sidebar_buddyradio_wrapper\" class=\"sidebar_pin_group\">\n            <div id=\"sidebar_buddyradio\" class=\"link_group\">\n		<span class=\"buddyradio_users\">\n			<span class=\"label ellipsis\">loading...</span>\n		</span>				\n		<a class=\"sidebar_link\" id=\"buddyradio_addLink\">\n			<span class=\"label\">Add...</span>\n		</a>\n		<a class=\"sidebar_link\" id=\"buddyradio_settingsLink\">\n			<span class=\"label\">Settings</span>\n		</a>\n	</div>	\n        </div>");
      newButton = $("#buddyradio_addLink");
      newButton.click(__bind(function() {
        var onConfirmAddBuddy, onConfirmImportBuddies, position;
        if ($("#buddyradio_newuserform").length === 1) {
          $("#buddyradio_newuserform").remove();
          return;
        }
        position = newButton.offset();
        $("body").append("<div id=\"buddyradio_newuserform\" style=\"position: absolute; top: " + (position.top + 20) + "px; left: " + (position.left + 20) + "px; display: block;width: auto; height: 80px;\" class=\"jjmenu\">\n	<div class=\"jj_menu_item\">\n		<div style=\"width: 100px;float:left\" class=\"input_wrapper\">\n			<div class=\"cap\">\n				<input type=\"text\" id=\"buddyradio_newuser\" name=\"buddy\" /> \n			</div>\n		</div>\n		<button id=\"buddyradio_adduserbutton\" type=\"button\" class=\"btn_style1\" style=\"margin: 4px 0 0 5px\">\n			<span>Add Last.fm Buddy</span>\n		</button>\n	</div>\n	<div class=\"jj_menu_item\" style=\"clear:both\">\n		<div class=\"input_wrapper\" style=\"width: 100px; float: left;\">\n			<div class=\"cap\">\n				<input type=\"text\" name=\"buddy\" id=\"buddyradio_importusers\"> \n			</div>\n		</div>\n		<button style=\"margin: 4px 0pt 0pt 5px;\" class=\"btn_style1\" type=\"button\" id=\"buddyradio_importusersbutton\">\n			<span>Import my Last.fm Buddies</span>\n		</button>\n		\n	</div>\n</div>");
        $("#buddyradio_newuser").focus();
        onConfirmAddBuddy = __bind(function() {
          $("#buddyradio_adduserbutton span").html("Adding Buddy...");
          this.controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value);
          return $("#buddyradio_newuserform").remove();
        }, this);
        $("#buddyradio_adduserbutton").click(onConfirmAddBuddy);
        $("#buddyradio_newuser").keydown(__bind(function(event) {
          if (event.which === 13) return onConfirmAddBuddy();
        }, this));
        onConfirmImportBuddies = __bind(function() {
          var result, username;
          username = $("#buddyradio_importusers")[0].value;
          if (!username) {
            alert("You need to enter the user name from which you want to import the Last.fm buddies.");
            return;
          }
          $("#buddyradio_importusersbutton span").html("Importing Buddies...");
          result = this.controller.importBuddies("Model.LastFmBuddyNetwork", username);
          if (result.error === "invalid_user") {
            alert("The user name you entered doesn't exist on Last.fm!");
          }
          return $("#buddyradio_newuserform").remove();
        }, this);
        $("#buddyradio_importusersbutton").click(onConfirmImportBuddies);
        return $("#buddyradio_importusers").keydown(__bind(function(event) {
          if (event.which === 13) return onConfirmImportBuddies();
        }, this));
      }, this));
      return $("#buddyradio_settingsLink").click(__bind(function() {
        var optionsPreload, optionsSongsPerFeed, position, songsPerFeedInARowValues;
        if ($("#buddyradio_settingsform").length === 1) {
          $("#buddyradio_settingsform").remove();
          return;
        }
        position = $("#buddyradio_settingsLink").offset();
        songsPerFeedInARowValues = [1, 2, 3, 4, 5, 10, 15, 20, 30, 40, 50, 100];
        optionsSongsPerFeed = this._constructOptions(songsPerFeedInARowValues, this.radio.getSongsPerFeedInARow());
        optionsPreload = this._constructOptions([0, 1, 2, 3, 4, 5], this.radio.getPreloadCount());
        $("body").append("<div id=\"buddyradio_settingsform\" style=\"position: absolute; top: " + (position.top + 20) + "px; left: " + (position.left + 20) + "px; display: block;width: 310px\" class=\"buddyradio_overlay\">\n	<div>\n		Play \n		<select name=\"songsPerFeedInARow\">\n			" + optionsSongsPerFeed + "\n		</select>\n		song/s in a row from same buddy\n	</div>\n	<div style=\"margin-top: 5px\">\n		Preload\n		<select name=\"preloadCount\">\n			" + optionsPreload + "\n		</select>\n		song/s when playing historic radio\n	</div>\n	<div style=\"padding-top:10px\">\n		<button type=\"button\" class=\"btn_style1\">\n			<span>Apply</span>\n		</button>					\n	</div>\n	<div style=\"margin-top:10px; float:right; text-align:right\">\n		BuddyRadio v0.3.1<br />\n		<a href=\"http://neothemachine.github.com/buddyradio\" target=\"_blank\">Project Page</a>\n	</div>\n</div>");
        return $("#buddyradio_settingsform button").click(__bind(function() {
          var preloadCount, songsPerFeed;
          songsPerFeed = $("#buddyradio_settingsform select[name=songsPerFeedInARow]")[0].value;
          preloadCount = $("#buddyradio_settingsform select[name=preloadCount]")[0].value;
          this.controller.setSongsPerFeedInARow(parseInt(songsPerFeed));
          this.controller.setPreloadCount(parseInt(preloadCount));
          return $("#buddyradio_settingsform").remove();
        }, this));
      }, this));
    };
    GroovesharkV2.prototype._constructOptions = function(options, selected) {
      if (selected == null) selected = null;
      return options.map(function(n) {
        var sel;
        sel = selected === n ? " selected" : "";
        return "<option value=\"" + n + "\"" + sel + ">" + n + "</option>";
      }).join();
    };
    GroovesharkV2.prototype.refresh = function() {
      var buddy, song, sortedBuddies, status, _i, _len;
      console.debug("refreshing view");
      $("#sidebar_buddyradio .buddyradio_users").empty();
      sortedBuddies = this.radio.buddyManager.buddies.slice();
      sortedBuddies.sort(function(a, b) {
        if (a.listeningStatus === b.listeningStatus) {
          if (a.username.toLowerCase() < b.username.toLowerCase()) {
            return -1;
          } else {
            return 1;
          }
        } else if (a.listeningStatus === "live") {
          return -1;
        } else if (b.listeningStatus === "live") {
          return 1;
        } else if (a.listeningStatus === "off") {
          return -1;
        } else {
          return 1;
        }
      });
      for (_i = 0, _len = sortedBuddies.length; _i < _len; _i++) {
        buddy = sortedBuddies[_i];
        status = buddy.listeningStatus.toUpperCase();
        if ((status === "LIVE" || status === "OFF") && (buddy.lastSong != null)) {
          song = "" + buddy.lastSong.artist + " - " + buddy.lastSong.title;
          if (status === "LIVE") {
            status += ", listening to: " + song;
          } else if (status === "OFF" && (buddy.lastSong != null)) {
            status += ", last listened to: " + song;
          }
        }
        $("#sidebar_buddyradio .buddyradio_users").append("<a rel=\"" + buddy.network.className + ":" + buddy.username + "\" class=\"sidebar_buddy buddy sidebar_link\">\n	<span class=\"icon remove\"></span>\n	<span class=\"icon more\"></span>\n	<span class=\"label ellipsis\" title=\"" + buddy.username + " (" + buddy.network.name + ") - " + status + "\">" + buddy.username + "</span>\n</a>");
        this._applyStyle(buddy);
      }
      $("a.sidebar_buddy .more").click(__bind(function(event) {
        var entry, networkClassName, username, _ref;
        event.preventDefault();
        event.stopPropagation();
        entry = $(event.currentTarget).parent();
        _ref = entry.attr("rel").split(":"), networkClassName = _ref[0], username = _ref[1];
        return this._showMoreMenu(networkClassName, username);
      }, this));
      $("a.sidebar_buddy .remove").click(__bind(function(event) {
        var networkClassName, username, _ref;
        event.preventDefault();
        event.stopPropagation();
        _ref = $(event.currentTarget).parent().attr("rel").split(":"), networkClassName = _ref[0], username = _ref[1];
        return this.controller.removeBuddy(networkClassName, username);
      }, this));
      return $("a.sidebar_buddy").click(__bind(function(event) {
        var networkClassName, username, _ref;
        event.preventDefault();
        _ref = $(event.currentTarget).attr("rel").split(":"), networkClassName = _ref[0], username = _ref[1];
        return this.controller.tune(networkClassName, username);
      }, this));
    };
    GroovesharkV2.prototype._currentlyOpenedMenu = null;
    GroovesharkV2.prototype._showMoreMenu = function(networkClassName, username) {
      var buddy, feedInfo, feedType, position;
      buddy = this.controller.getBuddy(networkClassName, username);
      if ($("#buddyradio_more").length === 1) {
        $("#buddyradio_more").remove();
        if (this._currentlyOpenedMenu === buddy) {
          this._currentlyOpenedMenu = null;
          return;
        }
      }
      this._currentlyOpenedMenu = buddy;
      position = $("a.sidebar_buddy[rel='" + networkClassName + ":" + username + "'] .more").offset();
      if (!(position != null)) return;
      feedInfo = "";
      if (this.radio.isFeedEnabled(buddy)) {
        feedType = this.radio.getFeedType(buddy);
        feedInfo = "<div style=\"margin-bottom:10px\">Tuned into <strong>" + feedType + "</strong> radio.<br />";
        if (feedType === "historic") {
          feedInfo += "" + (this.radio.getAlreadyFeededCount(buddy)) + " of " + (this.radio.getTotalCountForHistoricFeed(buddy)) + " songs enqueued so far.";
        } else {
          feedInfo += "" + (this.radio.getAlreadyFeededCount(buddy)) + " songs enqueued so far.";
        }
        feedInfo += "</div>";
      }
      $("body").append("<div id=\"buddyradio_more\" style=\"position: absolute; top: " + (position.top + 20) + "px; left: " + (position.left + 20) + "px; display: block;width: 260px\" class=\"buddyradio_overlay\">\n	" + feedInfo + "\n	<div class=\"buttons\">\n		<img style=\"float:left; padding-right:10px;\" src=\"" + buddy.avatarUrl + "\" />\n		<button type=\"button\" class=\"btn_style1 viewprofile\">\n			<span>View Profile on " + buddy.network.name + "</span>\n		</button>\n	</div>\n</div>");
      $("#buddyradio_more button.viewprofile").click(__bind(function() {
        window.open(buddy.profileUrl);
        $("#buddyradio_more").remove();
        return this._currentlyOpenedMenu = null;
      }, this));
      if (buddy.supportsHistoricFeed()) {
        $("#buddyradio_more div.buttons").append("<button style=\"margin-top: 5px\" type=\"button\" class=\"btn_style1 fetchlastweek\">\n	<span>Listen previously played songs</span>\n</button>");
        $("#buddyradio_more").append("<div class=\"lastweekdata\" style=\"clear:both\"></div>");
        return $("#buddyradio_more button.fetchlastweek").click(__bind(function() {
          var date, day, el, today, todaysDay, _ref;
          $("#buddyradio_more button.fetchlastweek span").html("Checking last week's songs...");
          el = $("#buddyradio_more .lastweekdata");
          today = new Date();
          todaysDay = today.getDate();
          for (day = todaysDay, _ref = todaysDay - 7; todaysDay <= _ref ? day < _ref : day > _ref; todaysDay <= _ref ? day++ : day--) {
            date = new Date(today.getFullYear(), today.getMonth(), day);
            if (buddy.hasHistoricData(date)) {
              el.append("<a rel=\"" + (date.getTime()) + "\">Listen songs from " + (date.toDateString()) + "</a><br />");
            } else {
              el.append("No songs played " + (date.toDateString()) + "<br />");
            }
          }
          $("#buddyradio_more button.fetchlastweek").remove();
          return $("#buddyradio_more .lastweekdata a").click(__bind(function(event) {
            var from, to;
            $("#buddyradio_more").remove();
            from = new Date(parseInt($(event.currentTarget).attr("rel")));
            to = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59);
            return this.controller.tuneHistoric(networkClassName, username, from, to);
          }, this));
        }, this));
      }
    };
    return GroovesharkV2;
  })();
  Controller = {};
  Controller.Radio = (function() {
    function Radio(buddyNetworks, streamingNetworks) {
      this.buddyNetworks = buddyNetworks;
      this.streamingNetworks = streamingNetworks;
      this.radio = new Model.Radio(this.buddyNetworks, this.streamingNetworks);
    }
    Radio.prototype.start = function() {
      return this.radio.buddyManager.loadLocal();
    };
    Radio.prototype.addBuddy = function(networkClassName, username) {
      if (networkClassName && username) {
        return this.radio.buddyManager.addBuddy(networkClassName, username);
      }
    };
    Radio.prototype.removeBuddy = function(networkClassName, username) {
      if (networkClassName && username) {
        return this.radio.buddyManager.removeBuddy(this.radio.buddyManager.getBuddy(networkClassName, username));
      }
    };
    Radio.prototype.getBuddy = function(networkClassName, username) {
      if (networkClassName && username) {
        return this.radio.buddyManager.getBuddy(networkClassName, username);
      }
    };
    Radio.prototype.importBuddies = function(networkClassName, username) {
      if (networkClassName && username) {
        return this.radio.buddyManager.importBuddies(networkClassName, username);
      }
    };
    Radio.prototype.tune = function(networkClassName, username) {
      if (networkClassName && username) {
        return this.radio.tune(this.radio.buddyManager.getBuddy(networkClassName, username));
      }
    };
    Radio.prototype.tuneHistoric = function(networkClassName, username, from, to) {
      if (networkClassName && username && from instanceof Date && to instanceof Date) {
        return this.radio.tune(this.radio.buddyManager.getBuddy(networkClassName, username), from, to);
      }
    };
    Radio.prototype.setSongsPerFeedInARow = function(count) {
      if ((count != null) && count > 0) {
        return this.radio.setSongsPerFeedInARow(count);
      }
    };
    Radio.prototype.setPreloadCount = function(count) {
      if ((count != null) && count >= 0) return this.radio.setPreloadCount(count);
    };
    return Radio;
  })();
}).call(this);
