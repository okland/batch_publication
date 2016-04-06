import {_} from 'meteor/underscore';
import DDPCommonBatch from './ddp-common-batch.js';
import MongoBasedCursor from './abstract-cursor/mongo-based-cursor.js';

/******* Batch Publication Class ************/
export var BatchPublicationClass = function (collectionName, abstractCursor, key) {
  var self = this;

  this.key = key;
  this.collectionName = collectionName;
  this.abstractCursor = abstractCursor;

  // Array holding all the publication instances of the clients listening to this publication.
  this.listeners = [];
  // Last update time of this publication.
  this.lut = 0;

  // The cached version of the last changes batch.
  this.lastChangesBatchMessagesCache = null;

  // An array holding the current batch waiting changes.
  this.changes = [];

  // The cache of the full image of the publication
  this.fullImageCache = null;

  // The batch publication observe handler
  this.handler = null;

  // A flag whether we already sent all the initial added messages -
  // especially relevant for the Oplog driver cause it helps to send the initial traffic as a batch
  this.sentInitialAdded = false;

  // todo separate to a function getCallbacks ?
  this.baseCallbacks = {
    oplog: {
      added (id, fields) {
        self.changes.push({o: 'added', d: DDPCommonBatch.stringifyDDP({id, fields})});
        self.sentInitialAdded && self.updateObjects.call(self);
      },
      changed (id, fields) {
        self.changes.push({o: 'changed', d: DDPCommonBatch.stringifyDDP({id, fields})});
        self.sentInitialAdded && self.updateObjects.call(self);
      },
      removed (id) {
        self.changes.push({o: 'removed', d: DDPCommonBatch.stringifyDDP({id})});
        self.sentInitialAdded && self.updateObjects.call(self);
      },
      bulkEnded() {
        self.sentInitialAdded = true;
        self.updateObjects.call(self);
      }
    },
    poll: {
      added(id, fields) {
        self.changes.push({o: 'added', d: DDPCommonBatch.stringifyDDP({id, fields})});
      },
      changed(id, fields) {
        self.changes.push({o: 'changed', d: DDPCommonBatch.stringifyDDP({id, fields})});
      },
      removed(id) {
        self.changes.push({o: 'removed', d: DDPCommonBatch.stringifyDDP({id})});
      },
      bulkEnded() {
        self.updateObjects.call(self);
      }
    }
  };

  // TODO check whether the internal cursor is oplog 
  this.callbacks = this.abstractCursor.isUsingOplog() ?
    this.baseCallbacks.oplog : this.baseCallbacks.poll;
};


_.extend(BatchPublicationClass.prototype, {
  refreshUpdatedObjects() {
    if (this.changes && this.changes.length) {
      this.lut = Date.now();
      this.lastChangesBatchMessagesCache = BatchPublicationHelper.createUpdateBatchMsgString(this.collectionName, this.lut, this.changes);
      this.changes = [];
      this.fullImageCache = null;
    } else {
      // Need to clean to cache of the last messages in order to avoid duplicates between them and the full image.
      this.lastChangesBatchMessagesCache = null;
    }
  },
  startObserve(pub) {
    if (!this.handle) {
      // Save observer key so we could find the need multiplexer
      this.listeners.push(pub);
      this.handle = this.abstractCursor.observeChanges(this.callbacks);

    } else {
      // Get last data
      this.sendFullImageForObserver(pub);
      this.listeners.push(pub);
    }
  },
  removedAllDocuments(pub) {
    let self = this,
      docs = this.getDocsMap();
    if (docs) {
      let removed = [];
      docs.forEach(function (doc, id) {
        removed.push({o: 'removed', d: DDPCommonBatch.stringifyDDP({id})});
      });
      // Send only if has items to remove
      if (!removed.length) {
        return;
      }
      let removedData = BatchPublicationHelper.createUpdateBatchMsgString(self.collectionName, Date.now(), removed);
      BatchPublicationHelper.sendUpdateBatch(pub, removedData, true);
    }
  },
  stopObserve(pub) {
    // Send removed messages to all publication documents
    this.removedAllDocuments(pub);
    // Remove publication from listeners
    this.listeners = _.without(this.listeners, pub);
    // If no more listeners close publication
    if (this.listeners.length === 0) {
      this.handle && this.handle.stop();
      this.handle = null;
      // Remove pointer to BatchPublication
      delete batchPublications[this.key];
    }
  },
  updateObjects() {
    var self = this;
    this.refreshUpdatedObjects();
    // Update each of observer listeners - only if still exists
    if (this.listeners && self.lastChangesBatchMessagesCache) {
      self.listeners.forEach(pub =>
        BatchPublicationHelper.sendUpdateBatch(pub, self.lastChangesBatchMessagesCache)
      );
    }
  },
  getDocsMap() {
    return this.abstractCursor.getCache();
  },
  sendFullImageForObserver(pub) {
    if (!this.fullImageCache) {
      // Get last data from multiplexer
      var docsMap = this.getDocsMap();
      if (docsMap) {
        var fullImageArr = [];
        docsMap.forEach(function (doc, id) {
          var fields = EJSON.clone(doc);
          delete fields._id;
          var data = {id, fields};
          fullImageArr.push({o: 'added', d: DDPCommonBatch.stringifyDDP(data)}); // we're going in order, so add at end
        });
        this.fullImageCache = BatchPublicationHelper.createUpdateBatchMsgString(this.collectionName, Date.now(), fullImageArr);
        fullImageArr = null;
      }
    }
    BatchPublicationHelper.sendUpdateBatch(pub, this.fullImageCache);
  }
});

var batchPublications = {};

export var BatchPublicationHelper = {
  /**
   * @summary Informs the subscriber that a batch update happend to the record set.
   *
   * @param {Subscription} subscription - that needs to be notified about batch update
   * @param {String} collectionName -  The name of the collection that contains the new document.
   * @param {String} lut - batch update time
   * @param {String} updates - JSON.stringify of array of all changes
   * @param {Boolean} isRemoveAll - Flag whether we need to removeAll documents from subscriptions - even if subscription closed.
   */
  sendUpdateBatch: function (subscription, updateBatchMessage, isRemoveAll) {
    if (subscription._isDeactivated() && !isRemoveAll) {
      return;
    }
    // Verify subscription is still sending
    if (subscription._session._isSending && subscription._session.socket) {
      subscription._session.socket.send(updateBatchMessage);
    }
  },
  /**
   * Create update batch message from updates lut and collectionName
   * @param collectionName {String}
   * @param lut {Number}
   * @param updates {Array}
   */
  createUpdateBatchMsgString: function (collectionName, lut, updates) {
    return JSON.stringify({msg: "updateBatch", collection: collectionName, lut, updates: JSON.stringify(updates)});
  }
};

/**
 * Factory class for creating batch publications.
 * The batch publication is a static one, doesn't change according arguments sent when subscribing.
 */
export var BatchPublicationFactory = {

  /**
   * check if the given publication is still active
   */
  isBatchPublicationAlive: function (key) {
    return key in batchPublications;
  },
  /**
   * create the cursor that will be used in the batch publication
   * @param collection
   * @param query
   * @param options
   * @return {*}
   */
  getCollectionCursor: function (collection, query, options) {
    return collection.find(query, options);
  },

  /**
   * build the key identifying a batch publication
   * @param collectionName
   * @param cursor
   */
  getPublicationKeyFromCursor: function (collectionName, cursor) {
    var tempKey = JSON.stringify(
      Object.assign({collectionName: collectionName}, cursor._cursorDescription)
    );
    //return SHA256(tempKey);
    return tempKey;
  },
  /**
   * create a publication key, according to which the publication will be stored
   */
  getPublicationKey: function (collectionName, collection, query = {}, options = {}) {
    var cursor = this.getCollectionCursor(collection, query, options);
    var key = this.getPublicationKeyFromCursor(collectionName, cursor);
    return key;
  },
  getOrCreateFromCursor(collectionName, cursor, key) {
    if (!batchPublications[key]) {
      var abstractCursor = new MongoBasedCursor(cursor);
      batchPublications[key] = new BatchPublicationClass(collectionName, abstractCursor, key);
    }
    return batchPublications[key];
  },
  getOrCreateFromAbstractCursor(collectionName, abstractCursor, key) {
    if (!batchPublications[key]) {
      batchPublications[key] = new BatchPublicationClass(collectionName, abstractCursor, key);
    }
    return batchPublications[key];
  },
  getOrCreate(collectionName, collection, query = {}, options = {}, key = null) {
    var cursor = this.getCollectionCursor(collection, query, options);
    if (!key) {
      key = this.getPublicationKeyFromCursor(collectionName, cursor);
    }
    return this.getOrCreateFromCursor(collectionName, cursor, key);
  },
  publishCollection({name, collection, isValid, query = {}, options = {}}) {
    Meteor.publish(name, function () {
      var self = this;

      this.unblock && this.unblock();
      // Validate publication arguments + user roles.
      if (isValid && typeof isValid == 'function') {
        // If validation didn't pass.
        if (!isValid.apply(this, arguments)) {
          return this.ready();
        }
      }
      // Input validation
      if (!collection || !collection._name) {
        throw new Meteor.Error(`BatchPublicationFactory.publishCollection.missingInput`,
          'Must give collection to BatchPublicationFactory.publishCollection.')
      }
      var cursor = BatchPublicationFactory.getCollectionCursor(collection, query, options);
      var publishKey = BatchPublicationFactory.getPublicationKeyFromCursor(collection._name, cursor);
      // Here we could check if can't handle publication - should redirect to other server -> if server have this ability.

      var bulkUpdatePublication = BatchPublicationFactory.getOrCreateFromCursor(collection._name, cursor, publishKey);
      bulkUpdatePublication.startObserve.call(bulkUpdatePublication, self);

      this.onStop(function () {
        bulkUpdatePublication.stopObserve.call(bulkUpdatePublication, self);
      });
      this.ready();
    });
  }
};




