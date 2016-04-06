import {DDPCommon} from 'meteor/ddp-common';
import {DDP} from 'meteor/ddp-client';
import {_} from 'meteor/underscore';
import {Meteor} from 'meteor/meteor';

// Hack extend __proto__ of Meteor.connection - don't want to re-create ddp-package
_.extend(Meteor.connection.__proto__, {
  _process_updateBatch: function _updateBatchFunc(msg, updates) {
    var collection = msg.collection,
      updateBatch = JSON.parse(msg.updates);

    msg.updates = null;
    msg = null;

    updateBatch.forEach(this._updateBatch_doc.bind(this, collection, updates));
    // Clear array of update batch
    updateBatch.length = 0;
  },
  _updateBatch_doc: function updateBatchDocFunc(collection, updates, doc) {
    var data = DDPCommon.parseDDP(doc.d);
    var message = {
      msg: doc.o,
      id: data && data.id,
      fields: data && data.fields,
      collection: collection || doc.c
    };

    this['_process_' + doc.o].call(this, message, updates);
  }
});

//// Extend connection custom messages to support updateBatch
var batchCustomMessages = {
  updateBatch: function (msg) {
    this._livedata_data.call(this, msg);
  }
};
DDP.extendCustomMessages(batchCustomMessages);

