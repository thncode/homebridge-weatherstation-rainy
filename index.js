var Service, Characteristic, HomebridgeAPI, UUIDGen, FakeGatoHistoryService;
var inherits = require('util').inherits;
var os = require("os");
var hostname = os.hostname();
const fs = require('fs');
const moment = require('moment');

const readFile = "/root/.homebridge/weatherstation.txt";

var rain, battery, alertLevel, readTime, raining, wasRaining;
var lastActivation, lastReset, lastChange, timesOpened, timeOpen, timeClose;

module.exports = function (homebridge) {
	
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;
    UUIDGen = homebridge.hap.uuid;
    FakeGatoHistoryService = require("fakegato-history")(homebridge);

    homebridge.registerAccessory("homebridge-weatherstation-rainy", "WeatherStationRainy", WeatherStationRainy);
};


function WeatherStationRainy(log, config) {

    var that = this;
    this.log = log;
    this.name = config.name;
    this.displayName = this.name;
    this.deviceId = config.deviceId;

    this.config = config;

	alertLevel = config['alertLevel'];

    this.setUpServices();

    this.readData();

   	fs.watch(readFile, (event, filename) => {
   		if (event === 'change') this.readData();
   	});
};


WeatherStationRainy.prototype.readData = function () {

	var data = fs.readFileSync(readFile, "utf-8");
	var lastSync = Date.parse(data.substring(0, 19));
	if (isNaN(lastSync)) return;
	if (readTime == lastSync) return;
	readTime = lastSync;

	temperature = parseFloat(data.substring(20));
	rain = parseFloat(data.substring(55));
	battery = parseFloat(data.substring(58));
	
	raining = (rain > alertLevel && temperature > 0) ? 1 : 0;
		
	if (raining != wasRaining) {
		
		wasRaining = raining;

		this.log("Rain data: ", rain, alertLevel, battery);

		this.fakeGatoHistoryService.addEntry({ time: moment().unix(), status: raining });
	
	    this.rainAlertService.getCharacteristic(Characteristic.ContactSensorState).updateValue(raining, null);
	    
	    if (raining) {
		    this.timesOpened = this.timesOpened + 1;
	        this.timeClose = this.timeClose + (moment().unix() - this.lastChange);
		    this.lastActivation = moment().unix() - this.fakeGatoHistoryService.getInitialTime();
	    	this.rainAlertService.getCharacteristic(Characteristic.TimesOpened).updateValue(this.timesOpened, null);
		    this.rainAlertService.getCharacteristic(Characteristic.LastActivation).updateValue(this.lastActivation, null)
	    }
	    else {
			this.timeOpen = this.timeOpen + (moment().unix() - this.lastChange);
	    }
	
		this.lastChange = moment().unix();
		this.fakeGatoHistoryService.setExtraPersistedData([{"lastActivation": this.lastActivation, "lastReset": this.lastReset, "lastChange": this.lastChange, 
															"timesOpened": this.timesOpened, "timeOpen": this.timeOpen, "timeClose": this.timeClose}]);
	}
    this.batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(null);
    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(null);
}; 


WeatherStationRainy.prototype.getFirmwareRevision = function (callback) {
    return callback(null, '1.0');
};

WeatherStationRainy.prototype.getBatteryLevel = function (callback) {
    return callback(null, (battery - 0.8) * 100);
};

WeatherStationRainy.prototype.getStatusActive = function (callback) {
    return callback(null, true);
};

WeatherStationRainy.prototype.getStatusLowBattery = function (callback) {
    return callback(null, battery >= 0.8 ? Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL : Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
};

WeatherStationRainy.prototype.getStatusRain = function (callback) {	
    return callback(null, raining);
};


WeatherStationRainy.prototype.getOpenDuration = function (callback) {
    this.rainAlertService.getCharacteristic(Characteristic.OpenDuration).updateValue(this.timeOpen, null);
    return callback(null, this.timeOpen);
};


WeatherStationRainy.prototype.getClosedDuration = function (callback) {
    this.rainAlertService.getCharacteristic(Characteristic.ClosedDuration).updateValue(this.timeClose, null);
    return callback(null, this.timeClose);
};


WeatherStationRainy.prototype.gettimesOpened = function (callback) {
    this.rainAlertService.getCharacteristic(Characteristic.TimesOpened).updateValue(this.timesOpened, null);
    return callback(null, this.timesOpened);
};


WeatherStationRainy.prototype.getLastActivation = function (callback) {
    this.rainAlertService.getCharacteristic(Characteristic.LastActivation).updateValue(this.lastActivation, null);
    return callback(null, this.lastActivation);
};


WeatherStationRainy.prototype.getReset = function (callback) {
    this.fakeGatoHistoryService.getCharacteristic(Characteristic.ResetTotal).updateValue(this.lastReset, null);
    return callback(null, this.lastReset);
};


WeatherStationRainy.prototype.setReset = function (value, callback) {
	this.timesOpened = 0;
	this.lastReset = value;
    this.fakeGatoHistoryService.setExtraPersistedData([{"lastActivation": this.lastActivation, "lastReset": this.lastReset, 
    			"lastChange": this.lastChange, "timesOpened": this.timesOpened, "timeOpen": this.timeOpen, "timeClose": this.timeClose}]);

    if (this.rainAlertService.getCharacteristic(Characteristic.TimesOpened)) {
        this.rainAlertService.getCharacteristic(Characteristic.TimesOpened).updateValue(this.timesOpened, null)
    }
    this.fakeGatoHistoryService.getCharacteristic(Characteristic.ResetTotal).updateValue(this.lastReset, null);
    return callback();
};


WeatherStationRainy.prototype.setUpServices = function () {
	
    this.informationService = new Service.AccessoryInformation();

    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "THN Systems")
        .setCharacteristic(Characteristic.Model, "WeatherStationRainy")
        .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
    this.informationService.getCharacteristic(Characteristic.FirmwareRevision)
        .on('get', this.getFirmwareRevision.bind(this));
        
    this.batteryService = new Service.BatteryService(this.name);
    this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', this.getBatteryLevel.bind(this));
    this.batteryService.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE);
    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));

    this.rainAlertService = new Service.ContactSensor("Regen", "rain");
    this.rainAlertService.getCharacteristic(Characteristic.ContactSensorState)
        .on('get', this.getStatusRain.bind(this));
    this.rainAlertService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));
    this.rainAlertService.getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this));

    Characteristic.OpenDuration = function() {
    	 Characteristic.call(this, 'Time open', 'E863F118-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.OpenDuration, Characteristic);
    Characteristic.OpenDuration.UUID = 'E863F118-079E-48FF-8F27-9C2605A29F52';  

    Characteristic.ClosedDuration = function() {
    	 Characteristic.call(this, 'Time closed', 'E863F119-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.ClosedDuration, Characteristic);
    Characteristic.ClosedDuration.UUID = 'E863F119-079E-48FF-8F27-9C2605A29F52';  
    
    Characteristic.LastActivation = function() {
    	 Characteristic.call(this, 'Last Activation', 'E863F11A-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.LastActivation, Characteristic);
    Characteristic.LastActivation.UUID = 'E863F11A-079E-48FF-8F27-9C2605A29F52';  

    Characteristic.TimesOpened = function() {
    	 Characteristic.call(this, 'times opened', 'E863F129-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.TimesOpened, Characteristic);
    Characteristic.TimesOpened.UUID = 'E863F129-079E-48FF-8F27-9C2605A29F52';  

    Characteristic.ResetTotal = function() {
    	 Characteristic.call(this, 'reset total', 'E863F112-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.ResetTotal, Characteristic);
    Characteristic.ResetTotal.UUID = 'E863F112-079E-48FF-8F27-9C2605A29F52';  
    
    this.rainAlertService.addCharacteristic(Characteristic.LastActivation)
        .on('get', this.getLastActivation.bind(this));
    this.rainAlertService.addCharacteristic(Characteristic.TimesOpened)
        .on('get', this.gettimesOpened.bind(this));
    this.rainAlertService.addCharacteristic(Characteristic.OpenDuration)
        .on('get', this.getOpenDuration.bind(this));
    this.rainAlertService.addCharacteristic(Characteristic.ClosedDuration)
        .on('get', this.getClosedDuration.bind(this));
    this.rainAlertService.addCharacteristic(Characteristic.ResetTotal)
        .on('get', this.getReset.bind(this))
        .on('set', this.setReset.bind(this));

    this.fakeGatoHistoryService = new FakeGatoHistoryService("door", this, { storage: 'fs' });

    this.fakeGatoHistoryLoaded();
};

        
WeatherStationRainy.prototype.fakeGatoHistoryLoaded = function () {
    if (this.fakeGatoHistoryService.isHistoryLoaded() == false) {
		this.log("wait for history load");
 		setTimeout(this.fakeGatoHistoryLoaded.bind(this), 100);
    } else {
		this.log("history loaded");
		
	    this.extra = this.fakeGatoHistoryService.getExtraPersistedData();
	            
	    if (this.extra == undefined) {
	    	
	    	this.lastActivation = 0;
	    	this.lastReset = moment().unix() - moment('2001-01-01T00:00:00Z').unix();
	    	this.lastChange = moment().unix();
	    	this.timesOpened = 0;
	    	this.timeOpen = 0;
	    	this.timeClose = 0;
	           
	        this.fakeGatoHistoryService.setExtraPersistedData([{"lastActivation": this.lastActivation, "lastReset": this.lastReset, 
	        				"lastChange": this.lastChange, "timesOpened": this.timesOpened, "timeOpen": this.timeOpen, "timeClose": this.timeClose}]);
	
	        } else {
	            this.lastActivation = this.fakeGatoHistoryService.getExtraPersistedData()[0].lastActivation;
	            this.lastReset = this.fakeGatoHistoryService.getExtraPersistedData()[0].lastReset;
	            this.lastChange = this.fakeGatoHistoryService.getExtraPersistedData()[0].lastChange;
	            this.timesOpened = this.fakeGatoHistoryService.getExtraPersistedData()[0].timesOpened;
	            this.timeOpen = this.fakeGatoHistoryService.getExtraPersistedData()[0].timeOpen;
	            this.timeClose = this.fakeGatoHistoryService.getExtraPersistedData()[0].timeClose;
	        }        
    }
};


WeatherStationRainy.prototype.getServices = function () {
    var services = [this.informationService, this.batteryService, this.fakeGatoHistoryService, this.rainAlertService];

    return services;
};
