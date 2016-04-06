import {_} from 'meteor/underscore';
import PublicationBatch from './publication_batch.js';
import DocumentRefCounter from './doc_ref_counter.js';
import debugLog from './debug.js';
import {BatchPublicationHelper} from '../batch-publication.js';
import DDPCommonBatch from '../ddp-common-batch.js';

var SubscriptionsBatch = {
  data: {},
  getKey: function(name, options, args) {
    // TODO check for faster non crypto hash key
    var tempKey = name + JSON.stringify(options) + JSON.stringify(args);
    //return SHA256(tempKey);
    return tempKey;
  },
  getOrCreate: function (meteorSub, name, options, args, key) {
    if (!key) {
      key = this.getKey(name, options, args);
    }
    if (!this.data[key]) {
      var subscription = new SubscriptionBatchClass(meteorSub);
      var instanceOptions = this._prepareOptions(options, args);
      _.each(instanceOptions, function (opt) {
        var pub = new PublicationBatch(subscription, opt);
        pub.publish();
        subscription.pubs.push(pub);
      });
      this.data[key] = subscription;
    } else {
      var subscription = this.data[key];
      // Send Initial publication
      subscription.sendLastDataForObserver(meteorSub);
      // Add meteor sub to subscriptions
      subscription.listeners.push(meteorSub);
    }
    return this.data[key];
  },
  _prepareOptions: function (options, args) {
    var preparedOptions = options;

    if (typeof preparedOptions === 'function') {
      preparedOptions = preparedOptions.apply(this, args);
    }

    if (!preparedOptions) {
      return [];
    }

    if (!_.isArray(preparedOptions)) {
      preparedOptions = [preparedOptions];
    }

    return preparedOptions;
  }
};


function SubscriptionBatchClass(meteorSub) {
  var self = this;

  this.lut = 0;

  this.results = null;
  this.changes = [];
  this.lastData = null;
  this.handler = null;

  // The functions that send things to client
  // TODO handle batch
  this.meteorSub = {
    added: function (collectionName, id, fields) {
      // Remove Id if needed
      let cloneFields = _.extend({}, fields);
      delete cloneFields._id;
      self.changes.push({o: 'added', c: collectionName, d: DDPCommonBatch.stringifyDDP({id, fields:cloneFields})});
      self.updateObjects.call(self);
    },
    changed: function (collectionName, id, fields) {
      self.changes.push({o: 'changed', c: collectionName, d: DDPCommonBatch.stringifyDDP({id, fields})});
      self.updateObjects.call(self);
    },
    removed: function (collectionName, id) {
      self.changes.push({o: 'removed', c: collectionName, d: DDPCommonBatch.stringifyDDP({id})});
      self.updateObjects.call(self);
    }
  };

  this.listeners = [meteorSub];
  this.pubs = [];
  this.docHash = {};

  // For stop callbacks
  this._stopCallbacks = [];

  this.refCounter = new DocumentRefCounter({
    onChange: function (collectionName, docId, refCount) {
      debugLog("Subscription.refCounter.onChange", collectionName + ":" + docId.valueOf() + " " + refCount);
      if (refCount <= 0) {
        self.meteorSub.removed(collectionName, docId);
        self._removeDocHash(collectionName, docId);
      }
    }
  });
};

SubscriptionBatchClass.prototype.sendLastDataForObserver = function (meteorSub) {
  var self = this;
  if (!this.lastData) {
    var lastDataArr = [];
    // Go over subscription doc hash and create data out of it
    if (this.docHash) {
      _.each(this.docHash, function (doc, hash) {
        var fields = EJSON.clone(doc);
        delete fields._id;
        var [collectionName, id] = hash.split('::');
        var data = {id, fields};
        lastDataArr.push({o: 'added', c: collectionName, d: DDPCommonBatch.stringifyDDP(data)}); // we're going in order, so add at end
      });
    }
    this.lastData = BatchPublicationHelper.createUpdateBatchMsgString(this.collectionName, Date.now(), lastDataArr);
    lastDataArr = null;
  }
  BatchPublicationHelper.sendUpdateBatch(meteorSub, this.lastData);
  meteorSub.ready();
};

SubscriptionBatchClass.prototype.sendRemoveAll = function (meteorSub) {
  if (this.docHash) {
    var removedArr = [];
    _.each(this.docHash, function (doc, hash) {
      var fields = EJSON.clone(doc);
      delete fields._id;
      var [collectionName, id] = hash.split('::');
      var data = {id};
      removedArr.push({o: 'removed', c: collectionName, d: DDPCommonBatch.stringifyDDP(data)}); // we're going in order, so add at end
    });
    var removedDataMsg = BatchPublicationHelper.createUpdateBatchMsgString(null, Date.now(), removedArr);
    BatchPublicationHelper.sendUpdateBatch(meteorSub, removedDataMsg, true);
  }
  meteorSub._deactivated = true;
};

SubscriptionBatchClass.prototype.updateObjects = function () {
  var self = this;
  this.refreshUpdatedObjects();
  // Update each of observer listeners - only if still exists
  if (this.listeners && self.results) {
    _.each(self.listeners, function (pub) {
      BatchPublicationHelper.sendUpdateBatch(pub, self.results);
    });
  }
};

SubscriptionBatchClass.prototype.refreshUpdatedObjects = function () {
  if (this.changes && this.changes.length) {
    this.lut = Date.now();
    this.results = BatchPublicationHelper.createUpdateBatchMsgString(this.collectionName, this.lut, this.changes);
    this.changes = [];
    this.lastData = null;
  } else {
    this.results = null;
  }
};

SubscriptionBatchClass.prototype.stopPublication = function (meteorSub) {
  var self = this;

  // Send removed event to all meteor sub docs
  this.sendRemoveAll(meteorSub);

  if (this.listeners && this.listeners.length == 1 && _.contains(this.listeners, meteorSub)) {
    _.each(this.pubs, function (pub) {
      pub.unpublish();
    });
    // Clear array
    this.pubs.length = 0;

    self.stop();

    if (SubscriptionsBatch.data) {
      // Remove pointer to subscription
      let key;
      _.find(SubscriptionsBatch.data, function (val, _key) {
        if (val != self) {
          return false;
        }

        key = _key;
        return true;
      });

      if (key) {
        delete SubscriptionsBatch.data[key];
      }
    }
  } else {
    this.listeners = _.without(this.listeners, meteorSub);
  }
};

SubscriptionBatchClass.prototype.added = function (collectionName, _id, fields) {
  let doc = fields ? _.extend({_id}, fields) : _id;

  this.refCounter.increment(collectionName, doc._id);

  if (this._hasDocChanged(collectionName, doc._id, doc)) {
    debugLog("Subscription.added", collectionName + ":" + doc._id);
    this.meteorSub.added(collectionName, doc._id, doc);
    this._addDocHash(collectionName, doc);
  }
};

SubscriptionBatchClass.prototype.changed = function (collectionName, id, changes) {
  if (this._shouldSendChanges(collectionName, id, changes)) {
    debugLog("Subscription.changed", collectionName + ":" + id);

    this.meteorSub.changed(collectionName, id, changes);
    this._updateDocHash(collectionName, id, changes);
  }
};

SubscriptionBatchClass.prototype.removed = function (collectionName, id) {
  debugLog("Subscription.removed", collectionName + ":" + id.valueOf());
  this.refCounter.decrement(collectionName, id);
};

SubscriptionBatchClass.prototype._addDocHash = function (collectionName, doc) {
  this.docHash[this._buildHashKey(collectionName, doc._id)] = doc;
};

SubscriptionBatchClass.prototype._updateDocHash = function (collectionName, id, changes) {
  var key = this._buildHashKey(collectionName, id);
  var existingDoc = this.docHash[key] || {};
  this.docHash[key] = _.extend(existingDoc, changes);
};

SubscriptionBatchClass.prototype._shouldSendChanges = function (collectionName, id, changes) {
  return this._isDocPublished(collectionName, id) &&
    this._hasDocChanged(collectionName, id, changes);
};

SubscriptionBatchClass.prototype._isDocPublished = function (collectionName, id) {
  var key = this._buildHashKey(collectionName, id);
  return !!this.docHash[key];
};

SubscriptionBatchClass.prototype._hasDocChanged = function (collectionName, id, doc) {
  var existingDoc = this.docHash[this._buildHashKey(collectionName, id)];

  if (!existingDoc) {
    return true;
  }

  for (var i in doc) {
    if (doc.hasOwnProperty(i) && !_.isEqual(doc[i], existingDoc[i])) {
      return true;
    }
  }

  return false;
};

SubscriptionBatchClass.prototype._removeDocHash = function (collectionName, id) {
  var key = this._buildHashKey(collectionName, id);
  delete this.docHash[key];
};

SubscriptionBatchClass.prototype._buildHashKey = function (collectionName, id) {
  return collectionName + "::" + id.valueOf();
};

/*** Base subscription methods ****/
SubscriptionBatchClass.prototype.ready = function () {
  _.each(this.listeners, function(sub) {
    sub && sub.ready && sub.ready();
  });
};

SubscriptionBatchClass.prototype.onStop = function (func) {
  this._stopCallbacks.push(func);
};

SubscriptionBatchClass.prototype.stop = function () {
  _.each(this._stopCallbacks, function(callback) {
    callback && callback();
  });
};

SubscriptionBatchClass.prototype.error = function () {
  console.log('error');
};

export default SubscriptionsBatch;
