/** Multi Client **/
//TODO remove logger

/**
 * allows mocking of multiple clients in unit tests
 * @param numOfClients
 * @constructor
 */
MultiClient = function(numOfClients) {

  this.totalClients = numOfClients;
  this.clients = {};
  this.waitFor = {};

  for (var i = 0; i < this.totalClients; i++) {
    this.clients[i] = new SingleClient(name, this);
  }
};

/**
 * subscribe a client group to a subscription.
 * the onReady callback will only be raised once.
 * @param {MultiClient.groups} group
 * @param name
 * @param options
 * @param onReady
 */
MultiClient.prototype.subscribe = function(group, name, options, onReady) {

  var self = this;
  self._waitFor(name, group, onReady);

  for (var i = 0; i < self.totalClients; i++) {

    var clientName = i;

    if (self._isClientInGroup(group, i)) {
      self.clients[clientName].subscribe(name, options);
    }
  }
};

/**
 * wait for an action to complete for all clients in the group.
 * raise the callback once, when all clients are done.
 * @param name
 * @param {MultiClient.groups} group
 * @param callback
 * @private
 */
MultiClient.prototype._waitFor = function(name, group, callback) {

  var toWaitFor = this.totalClients;
  if (group === MultiClient.groups.GROUP_A || group === MultiClient.groups.GROUP_B) {
    toWaitFor = Math.floor(this.totalClients / 2);
    if (this.totalClients % 2 === 1) {
      logger.log("odd number of clients - rounding down");
    }
  }

  this.waitFor[name] = new Wait(toWaitFor, callback);
};

/**
 * indicate an action we were waiting for has arrived for a single client
 * @param name
 * @private
 */
MultiClient.prototype._arrived = function(name) {
  this.waitFor[name].arrived();
};

/**
 * stop the subscription for all clients in the group.
 * the stopCallback will only be raised once.
 * @param {MultiClient.groups} group
 * @param name
 * @param stopCallback
 */
MultiClient.prototype.stop = function(group, name, stopCallback) {

  this._waitFor(name, group, stopCallback);

  for (var i = 0; i < this.totalClients; i++) {
    if (this._isClientInGroup(group, i)) {
      this.clients[i].stop(name, stopCallback);
    }
  }
};

/**
 * do something for all clients in the group.
 * @param {MultiClient.groups} group
 * @param toDoCallback should have a single parameter which will be the specific client currently handled
 */
MultiClient.prototype.do = function(group, toDoCallback) {
  for (var i = 0; i < this.totalClients; i++) {
    if (this._isClientInGroup(group, i)) {
      this.clients[i].do(toDoCallback);
    }
  }
};

/**
 * check if the given is part of the given group
 * @param {MultiClient.groups} group
 * @param clientIndex
 * @return {boolean}
 * @private
 */
MultiClient.prototype._isClientInGroup = function(group, clientIndex) {

  var isDo =
    group === MultiClient.groups.ALL ||
    (group === MultiClient.groups.GROUP_A && clientIndex % 2 === 0) ||
    (group === MultiClient.groups.GROUP_B && clientIndex % 2 === 1);

  return isDo;
};

/**
 * an enum representing the available client groups
 * @type {{ALL: number, GROUP_A: number, GROUP_B: number}}
 */
MultiClient.groups = {
  ALL: 0,
  GROUP_A: 1,
  GROUP_B: 2
};

/** Single Client **/

/**
 * a single client that in part of a MultiClient test
 * @param name
 * @param {MultiClient} multiClient
 * @constructor
 */
var SingleClient = function(name, multiClient) {

  // must include ddp-client package in order to use DDP
  var connection = DDP.connect('/');

  this.name = name;
  this.connection = connection;
  this.collections = {};
  this.collections['posts'] = new Mongo.Collection('batch-publication.collection.posts', {connection: connection});
  this.subscriptions = {};
  this.multiClient = multiClient;
  logger = new UnitTestLogger('multi-client-streams', connection);
};

SingleClient.prototype.subscribe = function(name, options) {

  var self = this;

  this.subscriptions[name] = this.connection.subscribe(name, options, {
    onReady: function() {
      self.multiClient._arrived(name);
    }
  });
};

SingleClient.prototype.stop = function(name) {
  var self = this;
  this.subscriptions[name].stop();
  // call a method and then call the stop callback to ensure that stop and removed already happened
  logger.log('stopped sub', function () {
    self.multiClient._arrived(name);
  });
};

SingleClient.prototype.do = function(toDo) {
  toDo(this);
};

/** Wait **/

/**
 * a utility class that manages waiting for an action to end for a number of clients and only raise the
 * callback once
 * @param total
 * @param callback
 * @constructor
 */
var Wait = function(total, callback) {
  this.total = total;
  this.count = 0;
  this.callback = callback;
};

Wait.prototype.arrived = function() {
  this.count++;
  if (this.total === this.count) {
    this.callback && this.callback();
  }
};
