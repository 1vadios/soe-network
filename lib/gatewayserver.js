var EventEmitter = require("events").EventEmitter,
    SOEServer = require("./soeserver").SOEServer,
    https = require("https"),
    fs = require("fs"),
    util = require("util"),
    GatewayProtocol = require("./gatewayprotocol").GatewayProtocol,
    log = require("loglevel");

function GatewayError(message) {
    this.name = this.constructor.name;
    this.message = message;
}
util.inherits(GatewayError, Error);

function GatewayServer(protocolName, serverPort, gatewayKey) {
    EventEmitter.call(this);
   
    this._compression = 0x0000;
    this._crcSeed = 0;
    this._crcLength = 2;
    this._udpLength = 512;

    var soeServer = this._soeServer = new SOEServer(protocolName, serverPort, gatewayKey);
    soeServer.toggleEncryption(false);
    var protocol = this._protocol = new GatewayProtocol();
    var me = this;

    soeServer.on("connect", function(err, client) {
        log.info("[GatewayServer]", "Client connected from " + client.address + ":" + client.port);
        me.emit("connect", err, client);
    });

    soeServer.on("disconnect", function(err, client) {
        log.info("[GatewayServer]", "Client disconnected from " + client.address + ":" + client.port);
        me.emit("disconnect", err, client);
    });

    soeServer.on("session", function(err, client) {
        log.info("[GatewayServer]", "Session started for client " + client.address + ":" + client.port);
    });
   
    soeServer.on("appdata", function(err, client, data) {
        var packet = protocol.parse(data),
            result = packet.result;
        switch (packet.name) {
            case "LoginRequest":
                soeServer.toggleEncryption(true);
                soeServer.sendAppData(
                    client, 
                    protocol.pack("LoginReply", {loggedIn: true}), 
                    true
                );
                soeServer.sendAppData(
                    client, 
                    protocol.pack("ChannelIsRoutable", {channel:0, isRoutable: true}), 
                    true
                );
                soeServer.sendAppData(
                    client, 
                    protocol.pack("ChannelIsRoutable", {channel:1, isRoutable: true}), 
                    true
                );

                me.emit("login", null, client);
                break;
            case "Logout":
                me.emit("logout", null, client);
                break;
            case "TunnelPacketFromExternalConnection":
                me.emit("tunneldata", null, client, packet.tunnelData, packet.flags);
                break;
        }
    });
}
util.inherits(GatewayServer, EventEmitter);

GatewayServer.prototype.start = function(callback) {
    log.info("[GatewayServer]", "Starting server");
    this._soeServer.start(
        this._compression, 
        this._crcSeed, 
        this._crcLength, 
        this._udpLength
    );
};

var n = 0;

GatewayServer.prototype.sendTunnelData = function(client, tunnelData) {
    log.debug("[GatewayServer]", "Sending tunnel data to client");
    var data = this._protocol.pack("TunnelPacketToExternalConnection", {
        channel:0,
        tunnelData: tunnelData
    });
    fs.writeFileSync("gatewayserver_appdata_" + (n++) + ".dat", data);
    this._soeServer.sendAppData(client, data);
};

GatewayServer.prototype.stop = function() {
    log.info("[GatewayServer]", "Shutting down");
};

exports.GatewayServer = GatewayServer;