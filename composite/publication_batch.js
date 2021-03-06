import debugLog from './debug.js';


// TODO add better naming
var PublicationBatch = function PublicationBatchClass(subscription, options, args) {
  // TODO do reuse here -- about shared subscription - option and args
  this.subscription = subscription;
  this.options = options;
  this.args = args || [];
  this.childrenDepend = options.childrenDepend || [];
  this.childrenOptions = options.children || [];
  this.publishedDocs = new PublishedDocumentList();
  this.collectionName = options.collectionName || null;
};

PublicationBatch.prototype.publish = function publish() {
  this.cursor = this._getCursor();
  if (!this.cursor || !this.cursor.observe) {
    this.observeHandle = this.cursor;
    return;
  }

  var collectionName = this._getCollectionName();
  var self = this;

  // TODO add option to use oplog or pooling batch option - use Batch if we can
  this.observeHandle = this.cursor.observe({
    added: function added(doc) {

      var alreadyPublished = self.publishedDocs.has(doc._id);
      if (alreadyPublished) {
        debugLog('Publication.observeHandle.added', collectionName + ':' + doc._id + ' already published');
        self.publishedDocs.unflagForRemoval(doc._id);
        self.subscription.changed(collectionName, doc._id, doc);
        if (self.hasChildrenDepend(_.keys(doc))) {
          self._republishChildrenOf.call(self, doc);
        }
      } else {
        self.publishedDocs.add(collectionName, doc._id);
        self.subscription.added(collectionName, doc);
        self._publishChildrenOf.call(self, doc);
      }
    },
    changed: function changed(newDoc, oldDoc) {

      debugLog('Publication.observeHandle.changed', collectionName + ':' + newDoc._id);
      let changes = DiffSequence.makeChangedFields(newDoc, oldDoc);
      // Check if relevant children field changed
      if (self.hasChildrenDepend(_.keys(changes))) {
        var alreadyPublished = self.publishedDocs.has(newDoc._id);
        // Check if need to publish children or re-publish children
        if (alreadyPublished) {
          self._republishChildrenOf.call(self, newDoc);
        } else {
          self._publishChildrenOf.call(self, newDoc);
        }
      }
    },
    removed: function removed(doc) {

      debugLog('Publication.observeHandle.removed', collectionName + ':' + doc._id);
      self._removeDoc(collectionName, doc._id);
    }
  });

  this.observeChangesHandle = this.cursor.observeChanges({
    changed: function changed(id, fields) {
      debugLog('Publication.observeChangesHandle.changed', collectionName + ':' + id);
      self.subscription.changed(collectionName, id, fields);
    }
  });
};

PublicationBatch.prototype.hasChildrenDepend = function hasChildrenDepend(keysArr) {
  if (!this.childrenDepend.length) {
    return true;
  }
  var relevantChangedFields = _.intersection(keysArr, this.childrenDepend);
  return !!(relevantChangedFields && relevantChangedFields.length);
};

PublicationBatch.prototype.unpublish = function unpublish() {
  debugLog('Publication.unpublish', this._getCollectionName());
  this._stopObservingCursor();
  this._unpublishAllDocuments();
};

PublicationBatch.prototype._republish = function _republish() {
  this._stopObservingCursor();

  this.publishedDocs.flagAllForRemoval();

  debugLog('Publication._republish', 'run .publish again');
  this.publish();

  debugLog('Publication._republish', 'unpublish docs from old cursor');
  this._removeFlaggedDocs();
};

PublicationBatch.prototype._getCursor = function _getCursor() {
  return this.options.find.apply(this.subscription, this.args);
};

PublicationBatch.prototype._getCollectionName = function _getCollectionName() {
  return this.collectionName || (this.cursor && this.cursor._getCollectionName && this.cursor._getCollectionName());
};

PublicationBatch.prototype._publishChildrenOf = function _publishChildrenOf(doc) {
  _.each(this.childrenOptions, function createChildPublication(options) {
    var pub = new PublicationBatch(this.subscription, options, [doc].concat(this.args));
    this.publishedDocs.addChildPub(doc._id, pub);
    pub.publish.call(pub);
  }, this);
};

PublicationBatch.prototype._republishChildrenOf = function _republishChildrenOf(doc) {
  this.publishedDocs.eachChildPub(doc._id, function (publication) {
    publication.args[0] = doc;
    publication._republish();
  });
};

PublicationBatch.prototype._unpublishAllDocuments = function _unpublishAllDocuments() {
  this.publishedDocs.eachDocument(function (doc) {
    this._removeDoc(doc.collectionName, doc.docId);
  }, this);
};

PublicationBatch.prototype._stopObservingCursor = function _stopObservingCursor() {
  debugLog('Publication._stopObservingCursor', 'stop observing cursor');
  if (this.observeHandle) {
    this.observeHandle.stop();
    delete this.observeHandle;
  }

  if (this.observeChangesHandle) {
    this.observeChangesHandle.stop();
    delete this.observeChangesHandle;
  }
};

PublicationBatch.prototype._removeFlaggedDocs = function _removeFlaggedDocs() {
  this.publishedDocs.eachDocument(function (doc) {
    if (doc.isFlaggedForRemoval()) {
      this._removeDoc(doc.collectionName, doc.docId);
    }
  }, this);
};

PublicationBatch.prototype._removeDoc = function _removeDoc(collectionName, docId) {
  this.subscription.removed(collectionName, docId);
  this._unpublishChildrenOf(docId);
  this.publishedDocs.remove(docId);
};

PublicationBatch.prototype._unpublishChildrenOf = function _unpublishChildrenOf(docId) {
  debugLog('Publication._unpublishChildrenOf', 'unpublishing children of ' + this._getCollectionName() + ':' + docId);

  this.publishedDocs.eachChildPub(docId, function (publication) {
    publication.unpublish();
  });
};


var PublishedDocumentList = function () {
  this.documents = {};
};

PublishedDocumentList.prototype.add = function add(collectionName, docId) {
  var key = this._valueOfId(docId);

  if (!this.documents[key]) {
    this.documents[key] = new PublishedDocument(collectionName, docId);
  }
};

PublishedDocumentList.prototype.addChildPub = function addChildPub(docId, publication) {
  if (!publication) {
    return;
  }

  var key = this._valueOfId(docId);
  var doc = this.documents[key];

  if (typeof doc === 'undefined') {
    throw new Error('Doc not found in list: ' + key);
  }

  this.documents[key].addChildPub(publication);
};

PublishedDocumentList.prototype.get = function get(docId) {
  var key = this._valueOfId(docId);
  return this.documents[key];
};

PublishedDocumentList.prototype.remove = function remove(docId) {
  var key = this._valueOfId(docId);
  delete this.documents[key];
};

PublishedDocumentList.prototype.has = function has(docId) {
  return !!this.get(docId);
};

PublishedDocumentList.prototype.eachDocument = function eachDocument(callback, context) {
  _.each(this.documents, function execCallbackOnDoc(doc) {
    callback.call(this, doc);
  }, context || this);
};

PublishedDocumentList.prototype.eachChildPub = function eachChildPub(docId, callback) {
  var doc = this.get(docId);

  if (doc) {
    doc.eachChildPub(callback);
  }
};

PublishedDocumentList.prototype.getIds = function getIds() {
  var docIds = [];

  this.eachDocument(function (doc) {
    docIds.push(doc.docId);
  });

  return docIds;
};

PublishedDocumentList.prototype.unflagForRemoval = function unflagForRemoval(docId) {
  var doc = this.get(docId);

  if (doc) {
    doc.unflagForRemoval();
  }
};

PublishedDocumentList.prototype.flagAllForRemoval = function flagAllForRemoval() {
  this.eachDocument(function flag(doc) {
    doc.flagForRemoval();
  });
};

PublishedDocumentList.prototype._valueOfId = function _valueOfId(docId) {
  if (docId === null) {
    throw new Error('Document ID is null');
  }
  if (typeof docId === 'undefined') {
    throw new Error('Document ID is undefined');
  }
  return docId.valueOf();
};


var PublishedDocument = function (collectionName, docId) {
  this.collectionName = collectionName;
  this.docId = docId;
  this.childPublications = [];
  this._isFlaggedForRemoval = false;
};

PublishedDocument.prototype.addChildPub = function addChildPub(childPublication) {
  this.childPublications.push(childPublication);
};

PublishedDocument.prototype.eachChildPub = function eachChildPub(callback) {
  for (var i = 0; i < this.childPublications.length; i++) {
    callback(this.childPublications[i]);
  }
};

PublishedDocument.prototype.isFlaggedForRemoval = function isFlaggedForRemoval() {
  return this._isFlaggedForRemoval;
};

PublishedDocument.prototype.unflagForRemoval = function unflagForRemoval() {
  this._isFlaggedForRemoval = false;
};

PublishedDocument.prototype.flagForRemoval = function flagForRemoval() {
  this._isFlaggedForRemoval = true;
};

export default PublicationBatch;

